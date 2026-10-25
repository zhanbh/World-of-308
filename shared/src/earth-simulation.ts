import {advanceEarthCombat} from './earth-combat-kernel.ts';
import type {EarthConfig,EarthState} from './earth-combat-kernel.ts';
import {advanceBadaoCombat} from './badao-combat-kernel.ts';
import type {BadaoConfig,BadaoState} from './badao-combat-kernel.ts';
import {advanceCrossCombat} from './cross-combat-kernel.ts';
import type {CrossConfig,CrossState,CrossCurrent} from './cross-combat-kernel.ts';
import {advanceBengshanCombat} from './bengshan-combat-kernel.ts';
import type {BengshanConfig,BengshanState} from './bengshan-combat-kernel.ts';
import {advanceBasicCombat} from './basic-combat-kernel.ts';
import type {CombatConfig,CombatState,CombatTarget,CombatEvent,Rational} from './basic-combat-kernel.ts';
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
export function advanceEarthSimulation(movement:MovementState,basic:CombatState,cross:CrossState,bengshan:BengshanState,badao:BadaoState,earth:EarthState,targets:CombatTarget[],inputs:ActionInput[],fromTick:number,toTick:number,movementConfig:MovementConfig,basicConfig:CombatConfig,crossConfig:CrossConfig,bengshanConfig:BengshanConfig,badaoConfig:BadaoConfig,earthConfig:EarthConfig,context:{challengeId:string;sceneEpoch:number;actorId:string;immuneToBleed?:number[]},stats:CrossCurrent,random:(cursor:number)=>number,resources?:(tick:number,mp:string)=>string){
 let m=structuredClone(movement),b=structuredClone(basic),s=structuredClone(cross),g=structuredClone(bengshan),d=structuredClone(badao),e=structuredClone(earth),ts=structuredClone(targets),mp=stats.mp;const events:CombatEvent[]=[];
 const cancel=()=>{b.cast=null;b.held=false;b.buffered=false;b.nextStage=0;b.comboExpiresUs=null;};
 for(let tick=fromTick;tick<toTick;tick++){
  if(resources)mp=resources(tick,mp);const at=inputs.filter(i=>i.tick===tick),priorCross=s.cast,priorBengshan=g.cast,priorBadao=d.cast,priorEarth=e.cast,before=b.cast;
  if(currentControlled(stats)){g.cast=null;d.cast=null;s.cast=null;e.cast=null;cancel();}
  if(e.cast&&e.cast.node===0)m=sweepBengshanMovement(m,{...e.cast,endUs:e.cast.nodesUs[0]} as any,tick,earthConfig as any,movementConfig);
  if(g.cast)m=sweepBengshanMovement(m,g.cast,tick,bengshanConfig,movementConfig);
  let cutoff:Rational={n:String(tick*10000),d:'1'};const current={...stats,mp,x:Number(m.x),y:Number(m.y),facing:m.facing};const {level,mp:_,controlled,mastery,...base}=current;
  const runCross=(list:ActionInput[])=>{s.randomCursor=b.randomCursor;const result=advanceCrossCombat(s,list,tick,tick+1,crossConfig,{...context,processUntilUs:cutoff},{...current,mp,controlled:current.controlled||Boolean(g.cast||d.cast||e.cast)},ts,random);s=result.state;ts=result.targets;mp=result.mp;b.randomCursor=s.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  const runBengshan=(list:ActionInput[])=>{g.randomCursor=b.randomCursor;const result=advanceBengshanCombat(g,list,tick,tick+1,bengshanConfig,{...context,processUntilUs:cutoff},{...current,mp,controlled:current.controlled||Boolean(s.cast||d.cast||e.cast)},ts,random);g=result.state;ts=result.targets;mp=result.mp;b.randomCursor=g.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  const runBadao=(list:ActionInput[])=>{d.randomCursor=b.randomCursor;const result=advanceBadaoCombat(d,list,tick,tick+1,badaoConfig,{...context,processUntilUs:cutoff},{...current,mp,controlled:current.controlled||Boolean(s.cast||g.cast||e.cast)},ts,random);d=result.state;ts=result.targets;mp=result.mp;b.randomCursor=d.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  const runEarth=(list:ActionInput[])=>{e.randomCursor=b.randomCursor;const result=advanceEarthCombat(e,list,tick,tick+1,earthConfig,{...context,processUntilUs:cutoff},{...current,mp,controlled:current.controlled||Boolean(s.cast||g.cast||d.cast)},ts,random);e=result.state;ts=result.targets;mp=result.mp;b.randomCursor=e.randomCursor;events.push(...result.events);if(result.accepted.length)cancel();};
  const compare=(a:Rational,b:Rational)=>{const n=BigInt(a.n)*BigInt(b.d)-BigInt(b.n)*BigInt(a.d);return n<0n?-1:n>0n?1:0;};
  const shifted=(origin:Rational,us:number,shot:{haste:Rational}):Rational=>{const h=BigInt(shot.haste.n)>2n*BigInt(shot.haste.d)?{n:'2',d:'1'}:shot.haste;let n=BigInt(origin.n)*BigInt(h.n)+BigInt(us)*BigInt(h.d)*BigInt(origin.d),d=BigInt(origin.d)*BigInt(h.n),a=n,b=d;while(b){const t=a%b;a=b;b=t;}n/=a||1n;d/=a||1n;return {n:String(n),d:String(d)};};
  const boundary:Rational={n:String(tick*10000),d:'1'};
  let previous:Rational|null=null;
  for(;;){const due:Rational[]=[boundary];if(b.cast)due.push(b.cast.impacted?b.cast.endUs:b.cast.impactUs);
   for(const [lane,cfg] of [[s,crossConfig],[g,bengshanConfig],[d,badaoConfig],[e,earthConfig]] as const){
    if(lane.cast){const cast=lane.cast;if('nodesUs'in cast&&cast.node<cast.nodesUs.length)due.push(cast.nodesUs[cast.node]);else if('nodeUs'in cast&&cast.node===0)due.push(cast.nodeUs);due.push(cast.endUs);}
    for(const effect of lane.effects){if(effect.kind==='bleed')due.push(shifted(effect.originUs,(effect.nextJump+1)*cfg.bleed.intervalUs,effect.snapshot));else if(effect.kind==='ground'){if(effect.node<4)due.push(effect.nodesUs[effect.node]);due.push(effect.endUs);}}
   }
   cutoff=due.filter(at=>compare(at,boundary)<=0&&(!previous||compare(at,previous)>0)).sort(compare)[0]??boundary;
   runCross([]);runBengshan([]);runBadao([]);runEarth([]);
   const basicResult=advanceBasicCombat(b,[],tick,tick+1,basicConfig,{...context,processUntilUs:cutoff},base,ts,random);b=basicResult.state;ts=basicResult.targets;events.push(...basicResult.events);
   s.randomCursor=g.randomCursor=d.randomCursor=e.randomCursor=b.randomCursor;
   if(compare(cutoff,boundary)===0)break;previous=cutoff;
  }
  for(const input of [...at].sort((a,b)=>a.seq-b.seq)){
   if(input.kind==='skill'&&input.skillId==='earth'){runEarth([input]);continue;}
   if(input.kind==='skill'&&input.skillId==='badao'){runBadao([input]);continue;}
   if(input.kind==='skill'&&input.skillId==='cross'){runCross([input]);continue;}
   if(input.kind==='skill'&&input.skillId==='bengshan'){runBengshan([input]);continue;}
   if((current.controlled||s.cast||g.cast||d.cast||e.cast)&&input.kind==='basic'){if(input.pressed)events.push({kind:'actionRejected',eventId:`combat:skill-lock:${context.challengeId}:${context.sceneEpoch}:${tick}:${input.seq}`,actorId:context.actorId,tick,seq:input.seq,targetId:null,damage:null,critical:null,code:current.controlled?'CONTROLLED':'ACTION_LOCKED'});else b.held=false;continue;}
   const result=advanceBasicCombat(b,[input],tick,tick,basicConfig,{...context,processUntilUs:boundary},base,ts,random);b=result.state;ts=result.targets;events.push(...result.events);
  }
  for(const lane of [s,g,d,e])lane.effects=lane.effects.filter(effect=>effect.kind!=='bleed'||ts.some(t=>t.actorIndex===effect.targetIndex&&t.lifeState==='alive')) as any;
  s.randomCursor=g.randomCursor=d.randomCursor=e.randomCursor=b.randomCursor;
  const action=before??b.cast,locked=current.controlled||Boolean(priorCross||s.cast||priorBengshan||g.cast||priorBadao||d.cast||priorEarth||e.cast)||action!==null&&BigInt(tick)*10000n*BigInt(action.moveUnlockUs.d)<BigInt(action.moveUnlockUs.n);
  m=advanceMovement(m,at.filter(i=>i.kind==='move'),tick,tick+1,locked?{...movementConfig,walkSpeed:0,runSpeed:0,ySpeed:0}:movementConfig).state;
 }
 if(resources)mp=resources(toTick,mp);return {movement:m,state:b,cross:s,bengshan:g,badao:d,earth:e,targets:ts,events,mp};
}
