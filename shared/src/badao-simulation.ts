import {advanceBadaoCombat} from './badao-combat-kernel.ts';
import type {BadaoConfig,BadaoState} from './badao-combat-kernel.ts';
import {advanceCrossCombat} from './cross-combat-kernel.ts';
import type {CrossConfig,CrossState,CrossCurrent} from './cross-combat-kernel.ts';
import {advanceBengshanCombat} from './bengshan-combat-kernel.ts';
import type {BengshanConfig,BengshanState} from './bengshan-combat-kernel.ts';
import {advanceBasicCombat} from './basic-combat-kernel.ts';
import type {CombatConfig,CombatState,CombatTarget,CombatEvent} from './basic-combat-kernel.ts';
import {advanceMovement} from './movement-kernel.ts';
import type {MovementState,MovementConfig} from './movement-kernel.ts';
import type {ActionInput} from './protocol/simulation-v2.ts';
const currentControlled=(stats:CrossCurrent)=>stats.controlled;
/** Forced ground displacement uses the identical complete-path square sweep as ordinary movement. */
export function sweepBengshanMovement(m:MovementState,cast:NonNullable<BengshanState['cast']>,tick:number,cfg:BengshanConfig,map:MovementConfig):MovementState{
 const origin=BigInt(cast.originUs.n),den=BigInt(cast.originUs.d),end=cast.endUs;
 const progress=(t:number)=>{let n=BigInt(t)*10000n*den-origin;if(n<0n)n=0n;const d=BigInt(end.n)*den-origin*BigInt(end.d);n=n*BigInt(end.d);if(n>d)n=d;return BigInt(cfg.displacement)*n/d;};
 const delta=Number(progress(tick)-progress(Math.max(0,tick-1)));if(delta===0)return m;
 const saved={intentX:m.intentX,intentY:m.intentY,facing:m.facing};const result=advanceMovement({...m,remainderX:'0',remainderY:'0',intentX:cast.snapshot.facing*1000,intentY:0},[],tick,tick+1,{...map,walkSpeed:delta*100,runSpeed:delta*100,ySpeed:0}).state;return {...result,...saved};
}
export function advanceBadaoSimulation(movement:MovementState,basic:CombatState,cross:CrossState,bengshan:BengshanState,badao:BadaoState,targets:CombatTarget[],inputs:ActionInput[],fromTick:number,toTick:number,movementConfig:MovementConfig,basicConfig:CombatConfig,crossConfig:CrossConfig,bengshanConfig:BengshanConfig,badaoConfig:BadaoConfig,context:{challengeId:string;sceneEpoch:number;actorId:string;immuneToBleed?:number[]},stats:CrossCurrent,random:(cursor:number)=>number,resources?:(tick:number,mp:string)=>string){
 let m=structuredClone(movement),b=structuredClone(basic),s=structuredClone(cross),g=structuredClone(bengshan),d=structuredClone(badao),ts=structuredClone(targets),mp=stats.mp;const events:CombatEvent[]=[];
 const cancel=()=>{b.cast=null;b.held=false;b.buffered=false;b.nextStage=0;b.comboExpiresUs=null;};
 for(let tick=fromTick;tick<toTick;tick++){
  if(resources)mp=resources(tick,mp);const at=inputs.filter(i=>i.tick===tick),priorCross=s.cast,priorBengshan=g.cast,priorBadao=d.cast,before=b.cast;
  if(currentControlled(stats)){g.cast=null;d.cast=null;s.cast=null;cancel();}
  if(g.cast)m=sweepBengshanMovement(m,g.cast,tick,bengshanConfig,movementConfig);
  const current={...stats,mp,x:Number(m.x),y:Number(m.y),facing:m.facing};const {level,mp:_,controlled,mastery,...base}=current;
  const runCross=(list:ActionInput[])=>{s.randomCursor=b.randomCursor;const result=advanceCrossCombat(s,list,tick,tick+1,crossConfig,context,{...current,mp,controlled:current.controlled||Boolean(g.cast||d.cast)},ts,random);s=result.state;ts=result.targets;mp=result.mp;b.randomCursor=s.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  const runBengshan=(list:ActionInput[])=>{g.randomCursor=b.randomCursor;const result=advanceBengshanCombat(g,list,tick,tick+1,bengshanConfig,context,{...current,mp,controlled:current.controlled||Boolean(s.cast||d.cast)},ts,random);g=result.state;ts=result.targets;mp=result.mp;b.randomCursor=g.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  const runBadao=(list:ActionInput[])=>{d.randomCursor=b.randomCursor;const result=advanceBadaoCombat(d,list,tick,tick+1,badaoConfig,context,{...current,mp,controlled:current.controlled||Boolean(s.cast||g.cast)},ts,random);d=result.state;ts=result.targets;mp=result.mp;b.randomCursor=d.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  runCross([]);runBengshan([]);runBadao([]);
  for(const input of [...at].sort((a,b)=>a.seq-b.seq)){
   if(input.kind==='skill'&&input.skillId==='badao'){runBadao([input]);continue;}
   if(input.kind==='skill'&&input.skillId==='cross'){runCross([input]);continue;}
   if(input.kind==='skill'&&input.skillId==='bengshan'){runBengshan([input]);continue;}
   if((current.controlled||s.cast||g.cast||d.cast)&&input.kind==='basic'){if(input.pressed)events.push({kind:'actionRejected',eventId:`combat:skill-lock:${context.challengeId}:${context.sceneEpoch}:${tick}:${input.seq}`,actorId:context.actorId,tick,seq:input.seq,targetId:null,damage:null,critical:null,code:current.controlled?'CONTROLLED':'ACTION_LOCKED'});else b.held=false;continue;}
   const result=advanceBasicCombat(b,[input],tick,tick,basicConfig,context,base,ts,random);b=result.state;ts=result.targets;events.push(...result.events);
  }
  const result=advanceBasicCombat(b,[],tick,tick+1,basicConfig,context,base,ts,random);b=result.state;ts=result.targets;events.push(...result.events);s.randomCursor=g.randomCursor=d.randomCursor=b.randomCursor;
  const action=before??b.cast,locked=current.controlled||Boolean(priorCross||s.cast||priorBengshan||g.cast||priorBadao||d.cast)||action!==null&&BigInt(tick)*10000n*BigInt(action.moveUnlockUs.d)<BigInt(action.moveUnlockUs.n);
  m=advanceMovement(m,at.filter(i=>i.kind==='move'),tick,tick+1,locked?{...movementConfig,walkSpeed:0,runSpeed:0,ySpeed:0}:movementConfig).state;
 }
 if(resources)mp=resources(toTick,mp);return {movement:m,state:b,cross:s,bengshan:g,badao:d,targets:ts,events,mp};
}
