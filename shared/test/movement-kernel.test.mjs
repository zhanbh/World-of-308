import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMovement, validateMovementConfig } from '../src/movement-kernel.ts';
const config={schemaVersion:1,profile:'local-test-movement',units:'milli-design-pixel',ruleRef:'r',mapRef:'m',walkSpeed:123,runSpeed:301,ySpeed:77,deadzone:100,runThreshold:700,footprint:1,bounds:{minX:-100000,maxX:100000,minY:-100000,maxY:100000},walls:[]};
const state=()=>({x:'0',y:'0',remainderX:'0',remainderY:'0',facing:1,intentX:0,intentY:0});
test('whole and every split preserve exact signed fractional movement and intent',()=>{
 const inputs=[{seq:1,tick:0,kind:'move',x:-333,y:101}];
 const whole=advanceMovement(state(),inputs,0,100,config).state;
 assert.equal(whole.x,'-40'); assert.equal(whole.remainderX,'-95900'); assert.equal(whole.y,'77');
 for(let split=1;split<100;split++) assert.deepEqual(advanceMovement(advanceMovement(state(),inputs,0,split,config).state,[],split,100,config).state,whole);
 let fps=state();for(let t=0;t<100;t++)fps=advanceMovement(fps,t===0?inputs:[],t,t+1,config).state;assert.deepEqual(fps,whole);
});
test('deadzone, walking/running, fixed Y, facing and ordered explicit rejection',()=>{
 const r=advanceMovement(state(),[{seq:1,tick:0,kind:'move',x:1000,y:-101},{seq:2,tick:1,kind:'basic'},{seq:3,tick:1,kind:'skill'}],0,100,config);
 assert.equal(r.state.x,'301');assert.equal(r.state.y,'-77');assert.deepEqual(r.events.map(e=>e.seq),[2,3]);
 const stopped=advanceMovement(r.state,[{seq:4,tick:100,kind:'move',x:100,y:100}],100,110,config).state;
 assert.equal(stopped.x,r.state.x);assert.equal(stopped.y,r.state.y);assert.equal(stopped.facing,1);
});
test('sweep stops thin walls and corners, expanded by footprint, without banking',()=>{
 const c={...config,walkSpeed:100000,runSpeed:100000,ySpeed:100000,walls:[{minX:5,maxX:6,minY:-5,maxY:5}]};
 let r=advanceMovement(state(),[{seq:1,tick:0,kind:'move',x:1000,y:0}],0,10,c).state;assert.equal(r.x,'4');assert.equal(r.remainderX,'0');
 r=advanceMovement(r,[{seq:2,tick:10,kind:'move',x:-1000,y:0}],10,11,c).state;assert.equal(r.x,'-996');
 const corner={...c,walls:[{minX:5,maxX:6,minY:5,maxY:6}]};assert.equal(advanceMovement(state(),[{seq:1,tick:0,kind:'move',x:1000,y:1000}],0,1,corner).state.x,'4');
 const bound={...c,walls:[],bounds:{minX:-10,maxX:10,minY:-10,maxY:10}};assert.equal(advanceMovement(state(),[{seq:1,tick:0,kind:'move',x:-1000,y:0}],0,1,bound).state.x,'-9');
});
test('config rejects malformed geometry and unsafe integers',()=>{assert.equal(validateMovementConfig(config),config);for(const c of [{...config,walkSpeed:NaN},{...config,footprint:-1},{...config,extra:1},{...config,bounds:{...config.bounds,minX:100001}}])assert.throws(()=>validateMovementConfig(c));});
test('input changes at tick boundaries retain whole/split equality and no diagonal normalization',()=>{
 const inputs=[{seq:1,tick:0,kind:'move',x:699,y:200},{seq:2,tick:37,kind:'move',x:-700,y:-900},{seq:3,tick:71,kind:'move',x:0,y:0}];
 const whole=advanceMovement(state(),inputs,0,100,config).state;
 let split=state();for(let t=0;t<100;t++)split=advanceMovement(split,inputs.filter(i=>i.tick===t),t,t+1,config).state;
 assert.deepEqual(split,whole);assert.equal(whole.facing,-1);
 const low=advanceMovement(state(),[{seq:1,tick:0,kind:'move',x:1000,y:101}],0,100,config).state;
 const high=advanceMovement(state(),[{seq:1,tick:0,kind:'move',x:1000,y:1000}],0,100,config).state;
 assert.deepEqual(low, {...high,intentY:101});
});
test('a boundary contact discards fractional credit and permits moving away',()=>{
 const c={...config,runSpeed:301,bounds:{minX:-100,maxX:4,minY:-100,maxY:100}};
 const r=advanceMovement(state(),[{seq:1,tick:0,kind:'move',x:1000,y:0}],0,2,c).state;
 assert.equal(r.x,'3');assert.equal(r.remainderX,'0');
 const away=advanceMovement(r,[{seq:2,tick:2,kind:'move',x:-1000,y:0}],2,3,c).state;
 assert.equal(away.x,'0');assert.equal(away.remainderX,'-1000');
 assert.throws(()=>advanceMovement({...state(),x:'4'},[],0,1,c));
});
test('30/60/120 render schedules produce identical100 tick confirmed state',()=>{
 const inputs=[{seq:1,tick:0,kind:'move',x:333,y:700},{seq:2,tick:43,kind:'move',x:-901,y:-101}];
 const expected=advanceMovement(state(),inputs,0,100,config).state;
 for(const fps of [30,60,120]){let at=0,current=state();for(let frame=1;frame<=fps;frame++){const end=Math.floor(frame*100/fps);if(end>at){current=advanceMovement(current,inputs.filter(i=>i.tick>=at&&i.tick<end),at,end,config).state;at=end;}}assert.deepEqual(current,expected,`${fps} FPS`);}
});
