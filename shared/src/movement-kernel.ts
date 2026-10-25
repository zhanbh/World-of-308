/** Exact 10ms movement. Coordinates are 1/1000 design pixel; fractions use /100000. */
export type MovementRect = { minX:number; maxX:number; minY:number; maxY:number };
export type MovementConfig = { schemaVersion:1; profile:'local-test-movement'; units:'milli-design-pixel'; ruleRef:string; mapRef:string; walkSpeed:number; runSpeed:number; ySpeed:number; deadzone:number; runThreshold:number; footprint:number; bounds:MovementRect; walls:MovementRect[] };
export type MovementState = { x:string; y:string; remainderX:string; remainderY:string; facing:-1|1; intentX:number; intentY:number };
type Input={seq:number;tick:number;kind:string;x?:number;y?:number};
type Fraction={n:bigint;d:bigint};
const zero={n:0n,d:1n},one={n:1n,d:1n};
const cmp=(a:Fraction,b:Fraction)=>a.n*b.d-b.n*a.d;
function fraction(n:bigint,d:bigint):Fraction {return d<0n?{n:-n,d:-d}:{n,d};}
function shape(v:unknown,keys:string[]): asserts v is Record<string,unknown> {if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw new TypeError('INVALID_MOVEMENT_CONFIG');}
function integer(v:unknown,min=0,max=2147483647): asserts v is number {if(!Number.isSafeInteger(v)||Number(v)<min||Number(v)>max)throw new TypeError('INVALID_MOVEMENT_CONFIG');}
export function validateMovementConfig(value:unknown):MovementConfig {
 shape(value,['schemaVersion','profile','units','ruleRef','mapRef','walkSpeed','runSpeed','ySpeed','deadzone','runThreshold','footprint','bounds','walls']);
 if(value.schemaVersion!==1||value.profile!=='local-test-movement'||value.units!=='milli-design-pixel'||typeof value.ruleRef!=='string'||!value.ruleRef||typeof value.mapRef!=='string'||!value.mapRef)throw new TypeError('INVALID_MOVEMENT_CONFIG');
 for(const k of ['walkSpeed','runSpeed','ySpeed','footprint'])integer(value[k]);integer(value.deadzone,0,999);integer(value.runThreshold,Number(value.deadzone)+1,1000);
 const rect=(r:unknown)=>{shape(r,['minX','maxX','minY','maxY']);for(const k of Object.keys(r))integer(r[k],-2147483648);if(Number(r.minX)>=Number(r.maxX)||Number(r.minY)>=Number(r.maxY))throw new TypeError('INVALID_MOVEMENT_CONFIG');};
 rect(value.bounds);if(!Array.isArray(value.walls)||value.walls.length>256)throw new TypeError('INVALID_MOVEMENT_CONFIG');value.walls.forEach(rect);
 const c=value as unknown as MovementConfig;if(c.bounds.maxX-c.bounds.minX<2*c.footprint||c.bounds.maxY-c.bounds.minY<2*c.footprint)throw new TypeError('INVALID_MOVEMENT_CONFIG');return c;
}
// Slab entry computes an exact rational contact time; touching while departing is legal.
function wallContact(x:bigint,y:bigint,dx:bigint,dy:bigint,r:MovementRect,p:number):Fraction|null {
 let enter:Fraction|null=null,leave:Fraction|null=null;
 for(const [pos,delta,lo,hi] of [[x,dx,BigInt(r.minX-p),BigInt(r.maxX+p)],[y,dy,BigInt(r.minY-p),BigInt(r.maxY+p)]]) {
  if(delta===0n){if(pos<=lo||pos>=hi)return null;continue;}
  let a=fraction(lo-pos,delta),b=fraction(hi-pos,delta);if(cmp(a,b)>0n)[a,b]=[b,a];
  if(enter===null||cmp(a,enter)>0n)enter=a;if(leave===null||cmp(b,leave)<0n)leave=b;
 }
 if(enter===null||leave===null||cmp(enter,leave)>0n||cmp(leave,zero)<=0n||cmp(enter,one)>0n)return null;
 return cmp(enter,zero)<0n?zero:enter;
}
export function advanceMovement(initial:MovementState,inputs:Input[],fromTick:number,toTick:number,config:MovementConfig) {
 validateMovementConfig(config);integer(fromTick,0,Number.MAX_SAFE_INTEGER);integer(toTick,fromTick,Number.MAX_SAFE_INTEGER);
 const state={...initial};for(const k of ['x','y','remainderX','remainderY'] as const)if(!/^(0|-?[1-9][0-9]*)$/.test(state[k]))throw new TypeError('INVALID_MOVEMENT_STATE');
 if(BigInt(state.remainderX)<=-100000n||BigInt(state.remainderX)>=100000n||BigInt(state.remainderY)<=-100000n||BigInt(state.remainderY)>=100000n)throw new TypeError('INVALID_MOVEMENT_STATE');
 for(const axis of [state.intentX,state.intentY])integer(axis,-1000,1000);if(state.facing!==1&&state.facing!==-1)throw new TypeError('INVALID_MOVEMENT_STATE');
 const sx=BigInt(state.x),sy=BigInt(state.y);if(sx<BigInt(config.bounds.minX+config.footprint)||sx>BigInt(config.bounds.maxX-config.footprint)||sy<BigInt(config.bounds.minY+config.footprint)||sy>BigInt(config.bounds.maxY-config.footprint)||config.walls.some(w=>sx>BigInt(w.minX-config.footprint)&&sx<BigInt(w.maxX+config.footprint)&&sy>BigInt(w.minY-config.footprint)&&sy<BigInt(w.maxY+config.footprint)))throw new TypeError('INVALID_MOVEMENT_STATE');
 let previous=fromTick;for(const input of inputs){integer(input.tick,previous,toTick-1);previous=input.tick;if(input.kind==='move'){integer(input.x,-1000,1000);integer(input.y,-1000,1000);}}
 const events:Array<{seq:number;tick:number;kind:'rejected';code:'ACTION_NOT_SUPPORTED'}>=[];let index=0;
 for(let tick=fromTick;tick<toTick;tick++) {
  while(index<inputs.length&&inputs[index].tick===tick){const i=inputs[index++];if(i.kind==='move'){state.intentX=i.x!;state.intentY=i.y!;if(i.x!==0)state.facing=i.x!<0?-1:1;}else events.push({seq:i.seq,tick:i.tick,kind:'rejected',code:'ACTION_NOT_SUPPORTED'});}
  const ax=Math.abs(state.intentX)>config.deadzone?state.intentX:0,ay=Math.abs(state.intentY)>config.deadzone?Math.sign(state.intentY):0;
  const nx=BigInt(state.remainderX)+BigInt(Math.abs(ax)>=config.runThreshold?config.runSpeed:config.walkSpeed)*BigInt(ax),ny=BigInt(state.remainderY)+BigInt(config.ySpeed)*BigInt(ay)*1000n;
  const dx=nx/100000n,dy=ny/100000n,x=BigInt(state.x),y=BigInt(state.y);let contact=one,blocked=false;
  const hit=(f:Fraction)=>{if(cmp(f,zero)>=0n&&cmp(f,contact)<=0n){contact=f;blocked=true;}};
  for(const [pos,delta,lo,hi] of [[x,dx,BigInt(config.bounds.minX+config.footprint),BigInt(config.bounds.maxX-config.footprint)],[y,dy,BigInt(config.bounds.minY+config.footprint),BigInt(config.bounds.maxY-config.footprint)]]){if(delta>0n&&pos+delta>=hi)hit(fraction(hi-pos,delta));if(delta<0n&&pos+delta<=lo)hit(fraction(lo-pos,delta));}
  for(const wall of config.walls){const f=wallContact(x,y,dx,dy,wall,config.footprint);if(f)hit(f);}
  state.x=String(x+dx*contact.n/contact.d);state.y=String(y+dy*contact.n/contact.d);state.remainderX=blocked?'0':String(nx%100000n);state.remainderY=blocked?'0':String(ny%100000n);
 }
 return {state,events};
}
