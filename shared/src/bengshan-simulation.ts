import {advanceCrossCombat} from './cross-combat-kernel.ts';
import type {CrossConfig,CrossState,CrossCurrent} from './cross-combat-kernel.ts';
import {advanceBengshanCombat} from './bengshan-combat-kernel.ts';
import type {BengshanConfig,BengshanState} from './bengshan-combat-kernel.ts';
import {advanceBasicCombat} from './basic-combat-kernel.ts';
import type {CombatConfig,CombatState,CombatTarget,CombatEvent} from './basic-combat-kernel.ts';
import {advanceMovement} from './movement-kernel.ts';
import type {MovementState,MovementConfig} from './movement-kernel.ts';
import type {ActionInput} from './protocol/simulation-v2.ts';
import {sweepDisplacement} from './skill-displacement.ts';
const currentControlled=(stats:CrossCurrent)=>stats.controlled;
export type BengshanSimulationInput={movement:MovementState;basic:CombatState;cross:CrossState;bengshan:BengshanState;targets:CombatTarget[];inputs:ActionInput[];fromTick:number;toTick:number;movementConfig:MovementConfig;basicConfig:CombatConfig;crossConfig:CrossConfig;bengshanConfig:BengshanConfig;context:{challengeId:string;sceneEpoch:number;actorId:string;immuneToBleed?:number[]};stats:CrossCurrent;random:(cursor:number)=>number;resources?:(tick:number,mp:string)=>string};
export function advanceBengshanSimulation({movement,basic,cross,bengshan,targets,inputs,fromTick,toTick,movementConfig,basicConfig,crossConfig,bengshanConfig,context,stats,random,resources}:BengshanSimulationInput){
 let m=structuredClone(movement),b=structuredClone(basic),s=structuredClone(cross),g=structuredClone(bengshan),ts=structuredClone(targets),mp=stats.mp;const events:CombatEvent[]=[];
 const cancel=()=>{b.cast=null;b.held=false;b.buffered=false;b.nextStage=0;b.comboExpiresUs=null;};
 for(let tick=fromTick;tick<toTick;tick++){
  if(resources)mp=resources(tick,mp);const at=inputs.filter(i=>i.tick===tick),priorCross=s.cast,priorBengshan=g.cast,before=b.cast;
  if(currentControlled(stats)){g.cast=null;cancel();}
  if(g.cast)m=sweepDisplacement({movement:m,originUs:g.cast.originUs,endUs:g.cast.endUs,facing:g.cast.snapshot.facing,tick,distance:bengshanConfig.displacement,map:movementConfig});
  const current={...stats,mp,x:Number(m.x),y:Number(m.y),facing:m.facing};const {level,mp:_,controlled,mastery,...base}=current;
  const runCross=(list:ActionInput[])=>{s.randomCursor=b.randomCursor;const result=advanceCrossCombat(s,list,tick,tick+1,crossConfig,context,{...current,mp,controlled:current.controlled||Boolean(g.cast)},ts,random);s=result.state;ts=result.targets;mp=result.mp;b.randomCursor=s.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  const runBengshan=(list:ActionInput[])=>{g.randomCursor=b.randomCursor;const result=advanceBengshanCombat(g,list,tick,tick+1,bengshanConfig,context,{...current,mp,controlled:current.controlled||Boolean(s.cast)},ts,random);g=result.state;ts=result.targets;mp=result.mp;b.randomCursor=g.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  runCross([]);runBengshan([]);
  for(const input of [...at].sort((a,b)=>a.seq-b.seq)){
   if(input.kind==='skill'&&input.skillId==='cross'){runCross([input]);continue;}
   if(input.kind==='skill'&&input.skillId==='bengshan'){runBengshan([input]);continue;}
   if((current.controlled||s.cast||g.cast)&&input.kind==='basic'){if(input.pressed)events.push({kind:'actionRejected',eventId:`combat:skill-lock:${context.challengeId}:${context.sceneEpoch}:${tick}:${input.seq}`,actorId:context.actorId,tick,seq:input.seq,targetId:null,damage:null,critical:null,code:current.controlled?'CONTROLLED':'ACTION_LOCKED'});else b.held=false;continue;}
   const result=advanceBasicCombat(b,[input],tick,tick,basicConfig,context,base,ts,random);b=result.state;ts=result.targets;events.push(...result.events);
  }
  const result=advanceBasicCombat(b,[],tick,tick+1,basicConfig,context,base,ts,random);b=result.state;ts=result.targets;events.push(...result.events);s.randomCursor=g.randomCursor=b.randomCursor;
  const action=before??b.cast,locked=current.controlled||Boolean(priorCross||s.cast||priorBengshan||g.cast)||action!==null&&BigInt(tick)*10000n*BigInt(action.moveUnlockUs.d)<BigInt(action.moveUnlockUs.n);
  m=advanceMovement(m,at.filter(i=>i.kind==='move'),tick,tick+1,locked?{...movementConfig,walkSpeed:0,runSpeed:0,ySpeed:0}:movementConfig).state;
 }
 if(resources)mp=resources(toTick,mp);return {movement:m,state:b,cross:s,bengshan:g,targets:ts,events,mp};
}
