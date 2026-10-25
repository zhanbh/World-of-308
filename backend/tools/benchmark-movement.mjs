import {performance} from 'node:perf_hooks';
import {advanceMovement} from '../../shared/src/movement-kernel.ts';
const config={schemaVersion:1,profile:'local-test-movement',units:'milli-design-pixel',ruleRef:'cpu-test@1',mapRef:'cpu-map@1',walkSpeed:1001,runSpeed:3001,ySpeed:701,deadzone:100,runThreshold:600,footprint:10,bounds:{minX:-1000000,maxX:1000000,minY:-1000000,maxY:1000000},walls:Array.from({length:256},(_,i)=>({minX:10000+i*10,maxX:10001+i*10,minY:10000,maxY:10001}))};
const state={x:'0',y:'0',remainderX:'0',remainderY:'0',facing:1,intentX:0,intentY:0},inputs=[{seq:1,tick:0,kind:'move',x:333,y:1000}],samples=[];
for(let i=0;i<12;i++){const at=performance.now();advanceMovement(state,inputs,0,100,config);if(i>=2)samples.push(performance.now()-at);}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,ticks:100,walls:256,samples:10,minMs:Math.min(...samples),maxMs:Math.max(...samples),meanMs:samples.reduce((a,b)=>a+b)/samples.length}));
