import test from 'node:test';import assert from 'node:assert/strict';
import {advanceBengshanCombat,initialBengshanState} from '../src/bengshan-combat-kernel.ts';
const r=(n,d=1)=>({n:String(n),d:String(d)});
export const config={version:'training-bengshan-v1',rewardPolicy:'none',unlockLevel:5,mpCost:'10',cooldownUs:1000000,durationUs:400000,nodeOffsetsUs:[100000,200000,300000],rangeX:1000,rangeY:100,displacement:3000,damage:{base:'0',growth:'0',coefficient:r(1),nodeWeights:[1,1,1]},bleed:{coefficient:r(1),nodeWeights:[1,1,1],jumps:5,intervalUs:100000},knockdownThreshold:r(1),knockdownDurationUs:500000,specialKnockdownDurationUs:1000000};
export const stats={attackPower:'101',haste:r(1),damageBonus:r(0),hit:r(1),crit:r(0),critMultiplier:r(2),x:0,y:0,facing:1,level:5,mp:'100',controlled:false,mastery:r(0)};
export const target=()=>({actorIndex:1,actorId:'enemy',x:100,y:0,hp:'10000',maxHp:'10000',lifeState:'alive',mitigation:r(0),evasion:r(0),damageImmune:false,controlImmune:false,directSinceRise:'0',downUntilTick:null});export const ctx={challengeId:'c',sceneEpoch:1,actorId:'hero'};
test('three actual-position nodes conserve direct and bleed budgets and terminal alone applies special knockdown',()=>{const a=advanceBengshanCombat(initialBengshanState(),[{kind:'skill',skillId:'bengshan',seq:1,tick:0}],0,100,config,ctx,stats,[target()],()=>0);assert.equal(a.targets[0].hp,'9798');assert.equal(a.events.filter(e=>e.kind==='damage').length,18);assert.equal(a.events.find(e=>e.kind==='knockdown').tick,30);assert.equal(a.targets[0].downUntilTick,130);assert.equal(a.mp,'90');});
test('control interrupts only ungenerated nodes and leaves emitted bleed running',()=>{const a=advanceBengshanCombat(initialBengshanState(),[{kind:'skill',skillId:'bengshan',seq:1,tick:0}],0,11,config,ctx,stats,[target()],()=>0);const b=advanceBengshanCombat(a.state,[],11,100,config,ctx,{...stats,mp:a.mp,controlled:true},a.targets,()=>0);assert.equal(b.state.cast,null);assert.equal(b.targets[0].hp,'9934');assert.equal(b.events.filter(e=>e.kind==='damage').length,5);});

import {advanceBengshanSimulation} from '../src/bengshan-simulation.ts';
import {initialCrossState} from '../src/cross-combat-kernel.ts';
import {initialCombatState,TRAINING_BASIC_CONFIG} from '../src/basic-combat-kernel.ts';
const crossConfig={version:'training-cross-v1',rewardPolicy:'none',unlockLevel:1,mpCost:'10',cooldownUs:1000000,durationUs:300000,nodeOffsetsUs:[100000,200000],meleeRangeX:1000,rangeY:100,projectileSpeed:10000,projectileDurationUs:500000,projectileHalfWidth:10,damage:{base:'0',growth:'0',coefficient:r(1),nodeWeights:[1,2]},bleed:{coefficient:r(1),nodeWeights:[1,2],jumps:5,intervalUs:100000},knockdownThreshold:r(1),knockdownDurationUs:500000};
const map={schemaVersion:1,profile:'local-test-movement',units:'milli-design-pixel',ruleRef:'m@1',mapRef:'map@1',walkSpeed:1000,runSpeed:3000,ySpeed:700,deadzone:100,runThreshold:600,footprint:10,bounds:{minX:-10000,maxX:10000,minY:-1000,maxY:1000},walls:[]};
const movement={x:'0',y:'0',remainderX:'0',remainderY:'0',facing:1,intentX:0,intentY:0};
function simulate({m=movement,b=initialCombatState(),c=initialCrossState(),g=initialBengshanState(),targets=[target()],inputs=[{kind:'skill',skillId:'bengshan',seq:1,tick:0}],from=0,to=60,geometry=map,current=stats}={}){return advanceBengshanSimulation({movement:m,basic:b,cross:c,bengshan:g,targets:targets,inputs:inputs,fromTick:from,toTick:to,movementConfig:geometry,basicConfig:TRAINING_BASIC_CONFIG,crossConfig:crossConfig,bengshanConfig:config,context:ctx,stats:current,random:()=>0});}
test('forced displacement sweeps thin walls and footprint bounds before each actual-position hit',()=>{
 const wall={...map,walls:[{minX:100,maxX:101,minY:-100,maxY:100}]};const blocked=simulate({geometry:wall,targets:[{...target(),x:1200}]});assert.equal(blocked.movement.x,'90');assert.equal(blocked.events.filter(e=>e.kind==='damage').length,0);
 const corner=simulate({geometry:{...map,bounds:{minX:-10000,maxX:200,minY:-10,maxY:10}}});assert.equal(corner.movement.x,'190');assert.equal(corner.movement.y,'0');
 const left=simulate({m:{...movement,facing:-1},geometry:{...map,walls:[{minX:-101,maxX:-100,minY:-100,maxY:100}]}});assert.equal(left.movement.x,'-90');
});
test('all fragment cuts preserve swept movement, nodes, exact resources and event identity at capped haste',()=>{
 for(const speed of [r(3,2),r(2),r(3)]){const current={...stats,haste:speed},whole=simulate({current});for(let split=1;split<60;split++){const a=simulate({to:split,current}),b=simulate({m:a.movement,b:a.state,c:a.cross,g:a.bengshan,targets:a.targets,inputs:[],from:split,current:{...current,mp:a.mp}});assert.deepEqual({...b,events:[...a.events,...b.events]},whole);}}
 assert.equal(simulate({current:{...stats,haste:r(3)}}).movement.x,'3000');
});
test('ordinary control never shortens existing knockdown, superarmor blocks control, and death has priority',()=>{
 const long=advanceBengshanCombat(initialBengshanState(),[{kind:'skill',skillId:'bengshan',seq:1,tick:0}],0,31,{...config,knockdownThreshold:r(0)},ctx,stats,[{...target(),downUntilTick:500}],()=>0);assert.equal(long.targets[0].downUntilTick,500);
 const armored=advanceBengshanCombat(initialBengshanState(),[{kind:'skill',skillId:'bengshan',seq:1,tick:0}],0,31,config,ctx,stats,[{...target(),controlImmune:true}],()=>0);assert.equal(armored.targets[0].downUntilTick,null);assert.equal(armored.events.some(e=>e.kind==='knockdown'),false);
 const lethal=advanceBengshanCombat(initialBengshanState(),[{kind:'skill',skillId:'bengshan',seq:1,tick:0}],0,100,config,ctx,stats,[{...target(),hp:'1'}],()=>0);assert.equal(lethal.targets[0].lifeState,'dead');assert.equal(lethal.events.filter(e=>e.kind==='death').length,1);assert.equal(lethal.events.some(e=>e.kind==='rise'||e.kind==='knockdown'),false);
});

test('released cast freezes attack and haste while live defense changes once per remaining node and jump',()=>{
 const input=[{kind:'skill',skillId:'bengshan',seq:1,tick:0}];const a=advanceBengshanCombat(initialBengshanState(),input,0,11,config,ctx,stats,[target()],()=>0);
 const b=advanceBengshanCombat(a.state,[],11,100,config,ctx,{...stats,mp:a.mp,attackPower:'0',haste:r(2)},a.targets,()=>0);assert.equal(b.targets[0].hp,'9798');
 const mitigated=advanceBengshanCombat(a.state,[],11,100,config,ctx,{...stats,mp:a.mp},a.targets.map(t=>({...t,mitigation:r(1,2)})),()=>0);assert.ok(BigInt(mitigated.targets[0].hp)>9798n);assert.equal(mitigated.events.find(e=>e.kind==='damage').damage,'16');
});
test('player control interrupts remaining leap and rejects new basic without losing released bleed',()=>{
 const a=simulate({to:11,targets:[{...target(),x:1000}]});const b=simulate({m:a.movement,b:a.state,c:a.cross,g:a.bengshan,targets:a.targets,inputs:[{seq:2,tick:11,kind:'basic',pressed:true},{seq:3,tick:11,kind:'move',x:1000,y:0}],from:11,to:31,current:{...stats,mp:a.mp,controlled:true}});assert.equal(b.bengshan.cast,null);assert.equal(b.state.cast,null);assert.equal(b.movement.x,a.movement.x);assert.ok(b.events.some(e=>e.kind==='damage'));
});
