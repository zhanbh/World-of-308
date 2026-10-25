import {advanceMovement} from './movement-kernel.ts';
import type {MovementState,MovementConfig} from './movement-kernel.ts';
import type {Rational} from './basic-combat-kernel.ts';
/** Exact cumulative progress; each tick sweeps the complete path with the ordinary footprint. */
export function sweepDisplacement({movement:m,originUs,endUs:end,facing,tick,distance,map}:{movement:MovementState;originUs:Rational;endUs:Rational;facing:1|-1;tick:number;distance:number;map:MovementConfig}):MovementState{
 const origin=BigInt(originUs.n),den=BigInt(originUs.d);
 const progress=(t:number)=>{let n=BigInt(t)*10000n*den-origin;if(n<0n)n=0n;const d=BigInt(end.n)*den-origin*BigInt(end.d);n*=BigInt(end.d);if(n>d)n=d;return BigInt(distance)*n/d;};
 const delta=Number(progress(tick)-progress(Math.max(0,tick-1)));if(delta===0)return m;
 const saved={intentX:m.intentX,intentY:m.intentY,facing:m.facing};
 const result=advanceMovement({...m,remainderX:'0',remainderY:'0',intentX:facing*1000,intentY:0},[],tick,tick+1,{...map,walkSpeed:delta*100,runSpeed:delta*100,ySpeed:0}).state;
 return {...result,...saved};
}
