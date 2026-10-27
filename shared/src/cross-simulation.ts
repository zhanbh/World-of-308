import {advanceCrossCombat} from './cross-combat-kernel.ts';
import type {CrossConfig,CrossCurrent,CrossState} from './cross-combat-kernel.ts';
import {advanceBasicCombat} from './basic-combat-kernel.ts';
import type {CombatConfig,CombatState,CombatTarget,CombatEvent} from './basic-combat-kernel.ts';
import {advanceMovement} from './movement-kernel.ts';
import type {MovementState,MovementConfig} from './movement-kernel.ts';
import type {ActionInput} from './protocol/simulation-v2.ts';
/** Shared fixed-step authority/display orchestration. Resource callback runs at each logical input boundary. */
export function advanceCrossSimulation(movement:MovementState,basic:CombatState,cross:CrossState,targets:CombatTarget[],inputs:ActionInput[],fromTick:number,toTick:number,movementConfig:MovementConfig,basicConfig:CombatConfig,crossConfig:CrossConfig,context:{challengeId:string;sceneEpoch:number;actorId:string;immuneToBleed?:number[]},stats:CrossCurrent,random:(cursor:number)=>number,resources?:(tick:number,mp:string)=>string,supply?:(input:ActionInput&{kind:'item'},tick:number)=>{event:CombatEvent;mp?:string}){
 let m=structuredClone(movement),b=structuredClone(basic),s=structuredClone(cross),ts=structuredClone(targets),mp=stats.mp;const events:CombatEvent[]=[];
 for(let tick=fromTick;tick<toTick;tick++){
  if(resources)mp=resources(tick,mp);const at=inputs.filter(i=>i.tick===tick),current={...stats,mp,x:Number(m.x),y:Number(m.y),facing:m.facing};
  for(const item of at.filter(i=>i.kind==='item').sort((a,b)=>a.seq-b.seq)){
   if(supply){const res=supply(item as ActionInput&{kind:'item'},tick);if(res.event)events.push(res.event);if(res.mp!==undefined)mp=res.mp;}
  }
  const priorCross=s.cast,before=b.cast;if(current.controlled){s.cast=null;b.cast=null;b.held=false;b.buffered=false;b.nextStage=0;b.comboExpiresUs=null;}const {level,mp:_,controlled,mastery,...base}=current;
  const runCross=(list:ActionInput[])=>{s.randomCursor=b.randomCursor;const result=advanceCrossCombat(s,list,tick,tick+1,crossConfig,context,{...current,mp},ts,random);s=result.state;ts=result.targets;mp=result.mp;b.randomCursor=s.randomCursor;events.push(...result.events);if(result.accepted.length){b.cast=null;b.held=false;b.buffered=false;b.nextStage=0;b.comboExpiresUs=null;}};
  runCross([]);
  for(const input of [...at].sort((a,b)=>a.seq-b.seq)){
   if(input.kind==='item')continue;
   if(input.kind==='skill'&&input.skillId==='cross'){runCross([input]);continue;}
   if((current.controlled||s.cast)&&input.kind==='basic'){
    if(input.pressed)events.push({kind:'actionRejected',eventId:`combat:cross-lock:${context.challengeId}:${context.sceneEpoch}:${tick}:${input.seq}`,actorId:context.actorId,tick,seq:input.seq,targetId:null,damage:null,critical:null,code:current.controlled?'CONTROLLED':'ACTION_LOCKED'});
    else b.held=false;
    continue;
   }
   const result=advanceBasicCombat(b,[input],tick,tick,basicConfig,context,base,ts,random);b=result.state;ts=result.targets;events.push(...result.events);
  }
  const result=advanceBasicCombat(b,[],tick,tick+1,basicConfig,context,base,ts,random);b=result.state;ts=result.targets;events.push(...result.events);s.randomCursor=b.randomCursor;
  const locked=current.controlled||Boolean(priorCross||s.cast);
  const action=before??b.cast,moveLocked=locked||action!==null&&BigInt(tick)*10000n*BigInt(action.moveUnlockUs.d)<BigInt(action.moveUnlockUs.n);
  m=advanceMovement(m,at.filter(i=>i.kind==='move'),tick,tick+1,moveLocked?{...movementConfig,walkSpeed:0,runSpeed:0,ySpeed:0}:movementConfig).state;
 }
 if(resources)mp=resources(toTick,mp);return {movement:m,state:b,cross:s,targets:ts,events,mp};
}
