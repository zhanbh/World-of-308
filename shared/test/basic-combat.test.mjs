import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCombatState,advanceBasicCombat,TRAINING_BASIC_CONFIG} from '../src/basic-combat-kernel.ts';
const r=(n,d=1)=>({n:String(n),d:String(d)});
const stats={attackPower:'100',haste:r(3,2),damageBonus:r(0),hit:r(1),crit:r(0),critMultiplier:r(2),x:0,y:0,facing:1};
const target=()=>({actorIndex:1,actorId:'enemy',x:100,y:0,hp:'10000',maxHp:'10000',lifeState:'alive',mitigation:r(0),evasion:r(0),damageImmune:false,controlImmune:false,directSinceRise:'0',downUntilTick:null});
const ctx={challengeId:'challenge',sceneEpoch:1,actorId:'hero'};
const inputs=[{kind:'basic',pressed:true,seq:1,tick:0}];
test('held combo exact schedule and random cursor survive every split',()=>{
 const whole=advanceBasicCombat(initialCombatState(),inputs,0,100,TRAINING_BASIC_CONFIG,ctx,stats,[target()],()=>2147483648);
 assert.equal(whole.events.filter(e=>e.kind==='damage').length,5);
 for(let tick=1;tick<100;tick++){
 const a=advanceBasicCombat(initialCombatState(),inputs,0,tick,TRAINING_BASIC_CONFIG,ctx,stats,[target()],()=>2147483648);
 const b=advanceBasicCombat(a.state,[],tick,100,TRAINING_BASIC_CONFIG,ctx,stats,a.targets,()=>2147483648);
 assert.deepEqual(b.state,whole.state);assert.deepEqual(b.targets,whole.targets);assert.deepEqual([...a.events,...b.events],whole.events);
 }
});
test('geometry before draws; snapshot damage, individual hit/crit and current defense',()=>{
 const started=advanceBasicCombat(initialCombatState(),inputs,0,1,TRAINING_BASIC_CONFIG,ctx,stats,[target()],()=>0);
 const distant={...target(),actorIndex:2,actorId:'far',x:999999};
 const result=advanceBasicCombat(started.state,[{kind:'basic',pressed:false,seq:2,tick:1}],1,10,TRAINING_BASIC_CONFIG,ctx,{...stats,attackPower:'999'},[{...target(),mitigation:r(1,2)},distant],()=>0);
 assert.equal(result.targets[0].hp,'9950');assert.equal(result.state.randomCursor,2);assert.equal(result.events.find(e=>e.kind==='damage').damage,'50');
});
test('direct damage accumulates across casts, death has priority over control, rise resets tally',()=>{
 const config={...TRAINING_BASIC_CONFIG,knockdownThreshold:r(1,50),knockdownDurationUs:10000};
 const result=advanceBasicCombat(initialCombatState(),inputs,0,42,config,ctx,{...stats,haste:r(1)},[target()],()=>0);
 assert.equal(result.targets[0].directSinceRise,'200');assert.equal(result.events.filter(e=>e.kind==='knockdown').length,1);
 const risen=advanceBasicCombat(result.state,[],42,44,config,ctx,stats,result.targets,()=>0);
 assert.equal(risen.targets[0].directSinceRise,'0');assert.equal(risen.events.filter(e=>e.kind==='rise').length,1);
 const killed=advanceBasicCombat(initialCombatState(),inputs,0,12,config,ctx,stats,[{...target(),hp:'20',maxHp:'20'}],()=>0);
 assert.deepEqual(killed.events.map(e=>e.kind),['actionAccepted','damage','death']);
});
test('haste caps at two, zero damage has no floor, rejection preserves no implicit balance defaults',async()=>{
 const {validateCombatConfig,validateCombatState}=await import('../src/basic-combat-kernel.ts');
 const fast=advanceBasicCombat(initialCombatState(),inputs,0,8,TRAINING_BASIC_CONFIG,ctx,{...stats,attackPower:'0',haste:r(3)},[target()],()=>0);
 assert.equal(fast.events.find(e=>e.kind==='damage').tick,6);assert.equal(fast.events.find(e=>e.kind==='damage').damage,'0');
 assert.equal(fast.targets[0].hp,'10000');assert.equal(validateCombatState(JSON.parse(JSON.stringify(fast.state))).cast.sequence,1);
 assert.throws(()=>validateCombatConfig({...TRAINING_BASIC_CONFIG,rewardPolicy:'reward'}));
 assert.throws(()=>validateCombatConfig({...TRAINING_BASIC_CONFIG,stages:TRAINING_BASIC_CONFIG.stages.map(s=>({...s,durationUs:1000,impactUs:1,moveUnlockUs:1}))}));
});
test('stable target order uses separate hit then own crit draws and immunity remains explicit',()=>{
 const tape=[4294967295,0,0];let calls=[];
 const result=advanceBasicCombat(initialCombatState(),inputs,0,10,TRAINING_BASIC_CONFIG,ctx,{...stats,hit:r(1,2),crit:r(1,2)},[{...target(),actorIndex:2,actorId:'second'},{...target(),actorIndex:1,actorId:'first'}],i=>{calls.push(i);return tape[i];});
 assert.deepEqual(calls,[0,1,2]);assert.equal(result.targets[0].hp,'10000');assert.equal(result.targets[1].hp,'9800');assert.equal(result.events.find(e=>e.kind==='damage').targetId,'second');
 const immune=advanceBasicCombat(initialCombatState(),inputs,0,10,TRAINING_BASIC_CONFIG,ctx,stats,[{...target(),damageImmune:true}],()=>0);
 assert.equal(immune.targets[0].hp,'10000');assert.equal(immune.targets[0].directSinceRise,'0');
});

test('release on exact recovery boundary prevents a held autochain starting at that same instant',()=>{
 const c=structuredClone(TRAINING_BASIC_CONFIG),s=initialCombatState();
 const r=advanceBasicCombat(s,[{kind:'basic',pressed:true,seq:1,tick:0},{kind:'basic',pressed:false,seq:2,tick:28}],0,29,c,{challengeId:'c',sceneEpoch:1,actorId:'p'},{attackPower:'1000',haste:{n:'1',d:'1'},damageBonus:{n:'0',d:'1'},hit:{n:'1',d:'1'},crit:{n:'0',d:'1'},critMultiplier:{n:'2',d:'1'},x:0,y:0,facing:1},[],()=>0);
 assert.equal(r.state.castSequence,1);assert.equal(r.state.cast,null);
});
test('eligible failed hit returns an authoritative miss while geometry failures consume no draws',()=>{
 const r=advanceBasicCombat(initialCombatState(),[{kind:'basic',pressed:true,seq:1,tick:0}],0,15,TRAINING_BASIC_CONFIG,ctx,{...stats,hit:{n:'0',d:'1'}},[target()],()=>0);
 assert.equal(r.events.find(e=>e.kind==='miss')?.targetId,'enemy');assert.equal(r.state.randomCursor,1);
});

test('eight targets and nondivisible haste retain identical combat/movement at30/60/120 FPS and negative walls',async()=>{
 const {advanceBasicSimulation}=await import('../src/basic-simulation.ts');
 const movement={x:'-100',y:'0',remainderX:'0',remainderY:'0',facing:1,intentX:0,intentY:0},config={schemaVersion:1,profile:'local-test-movement',units:'milli-design-pixel',ruleRef:'test@1',mapRef:'test@1',walkSpeed:1001,runSpeed:3001,ySpeed:701,deadzone:100,runThreshold:600,footprint:10,bounds:{minX:-1000000,maxX:1000000,minY:-1000000,maxY:1000000},walls:[{minX:400,maxX:500,minY:-100,maxY:100}]},actions=[{kind:'basic',pressed:true,seq:1,tick:0},{kind:'move',x:1000,y:0,seq:2,tick:0},{kind:'basic',pressed:false,seq:3,tick:42}],targets=Array.from({length:8},(_,i)=>({...target(),actorIndex:i+1,actorId:`enemy${i}`,hp:'100000',maxHp:'100000'}));
 const run=(m,c,ts,at,to)=>advanceBasicSimulation(m,c,ts,actions.filter(a=>a.tick>=at&&a.tick<to),at,to,config,TRAINING_BASIC_CONFIG,ctx,stats,()=>0),whole=run(movement,initialCombatState(),targets,0,100);
 for(const fps of [30,60,120]){let m=movement,c=initialCombatState(),ts=targets,from=0;const events=[];for(let frame=1;frame<=fps;frame++){const to=Math.floor(frame*100/fps);if(to===from)continue;const r=run(m,c,ts,from,to);m=r.movement;c=r.state;ts=r.targets;events.push(...r.events);from=to;}assert.deepEqual({movement:m,state:c,targets:ts,events},whole);}
});
test('late buffered tap continues one beat after release; expired combo restarts first beat',()=>{
 const inputs=[{kind:'basic',pressed:true,seq:1,tick:0},{kind:'basic',pressed:false,seq:2,tick:1},{kind:'basic',pressed:true,seq:3,tick:20},{kind:'basic',pressed:false,seq:4,tick:21}];
 const a=advanceBasicCombat(initialCombatState(),inputs,0,60,TRAINING_BASIC_CONFIG,ctx,{...stats,haste:r(1)},[target()],()=>0);assert.equal(a.state.castSequence,2);assert.equal(a.state.cast,null);assert.equal(a.state.nextStage,2);
 const b=advanceBasicCombat(a.state,[{kind:'basic',pressed:true,seq:5,tick:90}],60,91,TRAINING_BASIC_CONFIG,ctx,{...stats,haste:r(1)},a.targets,()=>0);assert.equal(b.state.cast.stage,0);
});
