import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFixture} from './fixtures/prepare-fixture.mjs';
import {initialCheckpoint,parseRoleCheckpoint,parseSceneCheckpoint,writeChunk,encodedBytes,stateHash} from '../src/challenge/room-checkpoint.ts';
import {nextRoomFixture} from './next-room-v2.test.mjs';
async function fixture(){const h=await prepareFixture(),r=await h.service.execute(h.command),challenge=h.store.inspect(h.challengeId),cp=await initialCheckpoint(h.content,challenge,r.outcome.data,h.character().equipmentVersion);return {...h,challenge,cp};}
test('inner checkpoint rejects unknown schema, unsupported effects and non-string resources',async()=>{
 const {cp}=await fixture();assert.throws(()=>parseRoleCheckpoint({...cp.role,schemaVersion:3}));assert.throws(()=>parseRoleCheckpoint({...cp.role,privateSeed:'leak'}));assert.throws(()=>parseSceneCheckpoint({...cp.scene,effects:[[1]]}));assert.throws(()=>parseRoleCheckpoint({...cp.role,attackPower:1000}));
});
test('supported maximum nonempty CP encodes8enemies7cooldowns with max escaped IDs and uint64 resources',async()=>{
 const h=await fixture(),role=structuredClone(h.cp.role),scene=structuredClone(h.cp.scene),id='"\\'.repeat(64),max='18446744073709551615';
 role.player={...role.player,actorId:id,x:2147483647,y:-2147483648,hp:max,maxHp:max,mp:max,maxMp:max,actionId:'"\\'.repeat(32),phase:255};role.attackPower=max;role.equipmentVersion=Number.MAX_SAFE_INTEGER;role.cooldowns=role.cooldowns.map(cd=>({...cd,actorId:id,readyAtTick:Number.MAX_SAFE_INTEGER}));role.hpRegenRemainder={numerator:4294967294,denominator:4294967295};role.mpRegenRemainder={numerator:4294967293,denominator:4294967295};
 role.unlockedSkills=['cross','bengshan','badao','earth'].map(skillId=>({skillId,level:15,configRef:'"\\'.repeat(32)}));
 scene.enemies=Array.from({length:8},(_,i)=>({...scene.enemies[0],actor:{...scene.enemies[0].actor,actorId:(String(i)+id).slice(0,128),actorIndex:i+1,hp:max,maxHp:max,x:2147483647,y:-2147483648,actionId:'"\\'.repeat(32),phase:255},templateRef:'"\\'.repeat(32),attackPower:max,skillRefs:Array.from({length:8},()=> '"\\'.repeat(32)),aiPhase:255,targetIndex:8}));
 const parsedRole=parseRoleCheckpoint(role),parsedScene=parseSceneCheckpoint(scene);const challenge={...h.challenge,sceneEpoch:1};const chunks=await Promise.all([writeChunk(challenge,0,Number.MAX_SAFE_INTEGER,parsedRole),writeChunk(challenge,1,Number.MAX_SAFE_INTEGER,parsedScene)]);assert.ok(chunks.every(ch=>encodedBytes(ch)<=81920));assert.equal(chunks.length,2);assert.equal((await stateHash(parsedRole,parsedScene)).length,64);console.log('ST10-03 max supported chunks UTF-8',chunks.map(encodedBytes));
});
test('challenge read rejects malformed outer checkpoint metadata before login handoff',async()=>{
 for(const value of [null,false,NaN,0.5,-1,Number.MAX_SAFE_INTEGER+1,undefined]){
  const h=await nextRoomFixture();await h.store.run(async tx=>{const hd=await tx.get(h.headerId),ch=await tx.get(h.roleId);hd.activeChunks[0].chunkRevision=value;ch.chunkRevision=value;tx.set(h.headerId,hd);tx.set(h.roleId,ch);});
  assert.equal((await h.query()).error?.code,'SERVICE_UNAVAILABLE');
 }
 const h=await nextRoomFixture();await h.store.run(async tx=>{const hd=await tx.get(h.headerId);hd.acceptingInputs=null;tx.set(h.headerId,hd);});assert.equal((await h.query()).error?.code,'SERVICE_UNAVAILABLE');
});
test('challenge read fails closed on outer header/ref domains and valid CP still hands off',async()=>{
 const bad=[null,false,NaN,0.5,-1,Number.MAX_SAFE_INTEGER+1,undefined];
 for(const field of ['revision','sceneEpoch','sessionEpoch','rolePlayEpoch'])for(const value of bad){const h=await nextRoomFixture();await h.store.run(async tx=>{const hd=await tx.get(h.headerId);hd[field]=value;tx.set(h.headerId,hd);});assert.equal((await h.query()).error?.code,'SERVICE_UNAVAILABLE',field+':'+value);}
 for(const field of ['ordinal','sceneEpoch','hash'])for(const value of bad){const h=await nextRoomFixture();await h.store.run(async tx=>{const hd=await tx.get(h.headerId);hd.activeChunks[0][field]=value;tx.set(h.headerId,hd);});assert.equal((await h.query()).error?.code,'SERVICE_UNAVAILABLE',field+':'+value);}
 const h=await nextRoomFixture();assert.ok((await h.query()).data);
 const {LoginService}=await import('../src/identity/login-service.ts'),login=new LoginService({store:h.store,clock:h.clock,identity:h.identity,ticketTtlMs:60000,initialUnlocks:{},holdingsDomainRef:'bank-test-domain'}),p=await login.execute({protocolVersion:2,command:'session.prepare',payload:{launchId:'outer-valid',prepareOperationId:'outer-valid-prepare'}});
 assert.equal((await login.execute({protocolVersion:2,command:'session.commit',payload:{launchId:'outer-valid',ticketId:p.outcome.data.ticketId,openOperationId:'outer-valid-open'}})).outcome.status,'committed');
});
