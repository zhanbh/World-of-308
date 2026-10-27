import {advanceMovement} from './movement-kernel.ts';
import type {MovementState,MovementConfig} from './movement-kernel.ts';
import {advanceBasicCombat} from './basic-combat-kernel.ts';
import type {CombatState,CombatTarget,CombatStats,CombatConfig,CombatEvent} from './basic-combat-kernel.ts';
import type {ActionInput} from './protocol/simulation-v2.ts';
/** A bounded fixed-step orchestration shared by authority and display prediction. Nodes sample the beginning-of-step position. */
export function advanceBasicSimulation(movement:MovementState,combat:CombatState,targets:CombatTarget[],inputs:ActionInput[],fromTick:number,toTick:number,movementConfig:MovementConfig,combatConfig:CombatConfig,context:{challengeId:string;sceneEpoch:number;actorId:string},stats:CombatStats,random:(cursor:number)=>number,supply?:(input:ActionInput&({kind:'item'}|{kind:'trinket'}),tick:number)=>{event:CombatEvent},activeStats?:(tick:number,stats:CombatStats)=>CombatStats){
 let m=structuredClone(movement),c=structuredClone(combat),ts=structuredClone(targets);const events:CombatEvent[]=[];
 for(let tick=fromTick;tick<toTick;tick++){
  const at=inputs.filter(i=>i.tick===tick),before=c.cast;
  for(const item of at.filter(i=>i.kind==='item'||i.kind==='trinket').sort((a,b)=>a.seq-b.seq)){
   if(supply){const res=supply(item as ActionInput&({kind:'item'}|{kind:'trinket'}),tick);if(res.event)events.push(res.event);}
  }
  const effectiveStats=activeStats?activeStats(tick,stats):stats;
  const result=advanceBasicCombat(c,at.filter(i=>i.kind!=='item'&&i.kind!=='trinket'),tick,tick+1,combatConfig,context,{...effectiveStats,x:Number(m.x),y:Number(m.y),facing:m.facing},ts,random);c=result.state;ts=result.targets;events.push(...result.events);
  const action=before??c.cast,locked=action!==null&&BigInt(tick)*10000n*BigInt(action.moveUnlockUs.d)<BigInt(action.moveUnlockUs.n);
  const config=locked?{...movementConfig,walkSpeed:0,runSpeed:0,ySpeed:0}:movementConfig;
  m=advanceMovement(m,at.filter(i=>i.kind==='move'),tick,tick+1,config).state;
 }
 return {movement:m,state:c,targets:ts,events};
}
