import {basicFixture} from './basic-fixture.mjs';
import {loginKey,} from '../../src/identity/identity-v2.ts';
import {stateHash,writeChunk,readCheckpoint} from '../../src/challenge/room-checkpoint.ts';
export const CROSS_CONFIG={version:'training-cross-v1',rewardPolicy:'none',unlockLevel:1,mpCost:'10',cooldownUs:1000000,durationUs:300000,nodeOffsetsUs:[100000,200000],meleeRangeX:500000,rangeY:500000,projectileSpeed:1000000,projectileDurationUs:500000,projectileHalfWidth:10,damage:{nodeWeights:[1,2],base:'0',growth:'0',coefficient:{n:'1',d:'1'}},bleed:{coefficient:{n:'1',d:'1'},nodeWeights:[1,2],jumps:5,intervalUs:100000},knockdownThreshold:{n:'1',d:'1'},knockdownDurationUs:500000};
export async function crossFixture(patch={}){
 const h=await basicFixture({schemaVersion:2,profile:'local-test-cross',capabilities:['basic','cross','no-rewards'],mastery:{n:'0',d:'1'},cross:structuredClone(CROSS_CONFIG),...patch});
 const cp=()=>h.store.run(async tx=>readCheckpoint(tx,await tx.get(h.challengeId)));
 // Trusted fixture-only migration. Never exposed as a service command or production capability.
 async function roleFixture(change){await h.store.run(async tx=>{const challenge=await tx.get(h.challengeId),old=await readCheckpoint(tx,challenge);change(old.role);const chunk=await writeChunk(challenge,0,old.header.activeChunks[0].chunkRevision+1,old.role),hash=await stateHash(old.role,old.scene);tx.set(chunk.id,chunk);tx.set(old.header.id,{...old.header,activeChunks:old.header.activeChunks.map(r=>r.ordinal===0?{...r,hash:chunk.hash,chunkRevision:chunk.chunkRevision}:r),state:{...old.header.state,publicStateHash:hash}});});}
 return {...h,cp,roleFixture};
}
