import {terminalFixture} from './terminal-fixture.mjs';
import {earthFixture} from './earth-fixture.mjs';
import {maximumWarriorCheckpoint} from './compact-checkpoint-fixture.mjs';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
import {readCheckpoint,writeChunk,writeCrossChunks,stateHash} from '../../src/challenge/room-checkpoint.ts';
export async function jointTerminalFixture({due=false}={}) {
 const h=await terminalFixture({enemyCount:8,base:await earthFixture()});
 const config=h.content.terminal;
 Object.assign(config.equipment[0],{itemLevel:30});config.equipment[0].equipment.setRef={id:'test-set',version:1};
 config.holdingsDomain={ref:'bank-test-domain',keys:[{collectionKey:'set-weapon',setId:'test-set',setVersion:1,itemLevel:30,slotId:'weapon',classId:'warrior'}]};config.missingPolicy='missing-first';
 Object.assign(h.content.dungeons.find(d=>d.dungeonId===h.store.inspect(h.challengeId).dungeonId),{kind:'special',minLevel:30,maxMonsterLevel:30,difficulties:[{difficultyId:'normal',roomCost:3,levels:{30:{monsterStatsRef:'terminal-monsters',equipmentSourceRef:'terminal-equipment'}}}]});
 await h.store.run(async tx=>{
  const ch=await tx.get(h.challengeId);tx.set(ch.id,{...ch,monsterLevel:30,terminalConfigHash:await manifestDigest({terminal:config,rewards:h.content.rewards})});
  const c=await tx.get(h.characterId),w=await tx.get(c.equipped.weapon);
  for(const slot of ['shoulder','chest','pants','belt','boots','bracelet','necklace','ring','subEquip','magicStone','earring','trinket']){
   const id='joint-wear-'+slot;c.equipped[slot]=id;tx.set(id,{...structuredClone(w),id,slotKind:slot,location:{kind:'equipped',characterId:c.id,slotId:slot},durability:['shoulder','chest','pants','belt','boots','earring'].includes(slot)?{...w.durability,current:1}:{wearEnabled:false,current:null,max:null,policyRef:'no-wear'}});
  }tx.set(c.id,c);
  const b=await tx.get(c.backpackId);b.capacity=100;b.stage=4;b.slots=Object.fromEntries(Array.from({length:100},(_,i)=>[i,{kind:'stack',stackId:'junk-'+i,templateRef:{id:'ore',version:1},quantity:20,binding:{kind:'none'},traceRef:'junk-trace'}]));tx.set(b.id,b);
 });
 await maximumWarriorCheckpoint(h);
 if(due){
  await h.store.run(async tx=>{
   const ch=await tx.get(h.challengeId),cp=await readCheckpoint(tx,ch);
   // All six in-use effect blocks change through real simulation, rather than equal-hash sets.
   for(const name of ['cross','bengshan','earth'])for(const [index,e] of cp.scene[name].effects.entries()){if(due==='mixed'&&index%5>=3)continue;e.originUs={n:'0',d:'1'};e.nextJump=0;e.budget='5';e.snapshot.haste={n:'1',d:'1'};e.snapshot.crit={n:'0',d:'1'};}
   const chunks=[await writeChunk(ch,0,2,cp.role),await writeChunk(ch,1,2,cp.scene),...await writeCrossChunks(ch,cp.scene.cross,cp.header.activeChunks,cp.scene.bengshan,cp.scene.badao,cp.scene.earth,cp.effectChunks)];
   for(const c of chunks)tx.set(c.id,c);tx.set(cp.header.id,{...cp.header,activeChunks:chunks.map(c=>({ordinal:c.ordinal,chunkRevision:c.chunkRevision,hash:c.hash,sceneEpoch:c.sceneEpoch})),state:{...cp.header.state,publicStateHash:await stateHash(cp.role,cp.scene)}});
  });
 }
 h.service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:h.content});
 return h;
}
export function meteredService(h){
 const attempts=[];
 const service=new ChallengeService({store:{run:fn=>h.store.run(async tx=>{
  const reads=new Set(),writes=new Map();let getCalls=0,setCalls=0;
  const result=await fn({get:async id=>{reads.add(id);getCalls++;return tx.get(id);},set:(id,v)=>{setCalls++;writes.set(id,Buffer.byteLength(JSON.stringify(v)));tx.set(id,v);}});
  attempts.push({R:reads.size,W:writes.size,getCalls,setCalls,calls:getCalls+setCalls,bytes:[...writes.values()].reduce((a,b)=>a+b,0),maxWrite:Math.max(0,...writes.values()),readKeys:[...reads],writeKeys:[...writes.keys()]});return result;
 })},clock:h.clock,identity:h.identity,content:h.content});
 return {service,attempts};
}
