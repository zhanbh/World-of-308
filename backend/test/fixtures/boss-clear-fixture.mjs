import {dropFixture} from './drop-fixture.mjs';
import {readCheckpoint,writeChunk,stateHash} from '../../src/challenge/room-checkpoint.ts';
import {loginKey} from '../../src/identity/identity-v2.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
export async function bossClearFixture({rewards=true,hostile=false,enemyCount=5}={}){
 const h=hostile?await (await import('./monster-fixture.mjs')).monsterFixture():await dropFixture();if(hostile)h.drops={profile:'local-test-drops',ref:'drops-test-v1',authorization:'isolated-local-assets-only',candidates:[{kind:'stack',templateRef:{id:'ore',version:1},quantity:3,quality:'white',itemLevel:10,binding:{kind:'none'}}]};
 if(hostile){h.profile.config.stages[0].impactUs=20000;h.content.combat=h.profile;}
 // Trusted active-final-room fixture, never pre-completed and never fabricates a kill.
 await h.store.run(async tx=>{const old=await tx.get(h.challengeId),ch={...old,currentRoomNo:6},cp=await readCheckpoint(tx,old);if(hostile){cp.role.player.hp='1';cp.role.combat.configHash=await manifestDigest(h.profile);}cp.role.player.x=0;cp.role.player.y=0;cp.role.movement.state.x='0';cp.role.movement.state.y='0';
 while(cp.scene.enemies.length<enemyCount){const i=cp.scene.enemies.length,first=cp.scene.enemies[1],target=cp.scene.combat.targets[1];cp.scene.enemies.push({...structuredClone(first),actor:{...first.actor,actorId:'extra-'+i,actorIndex:i+1}});cp.scene.combat.targets.push({...structuredClone(target),actorId:'extra-'+i,actorIndex:i+1});}
 cp.scene.enemies.forEach((e,i)=>{e.role=i===0?'boss':'ordinary';e.actor.hp=i===0?'1':'999999999';e.actor.maxHp=e.actor.hp;e.actor.x=i===0?1:-1000;e.actor.y=0;Object.assign(cp.scene.combat.targets[i],{hp:e.actor.hp,maxHp:e.actor.maxHp,x:e.actor.x,y:0});});
 if(hostile){cp.scene.monsters.forEach((m,i)=>{m.identity=i===0?'boss':'ordinary';m.action=null;m.readyAtTick=0;m.attackPower='1000000';cp.scene.enemies[i].attackPower=m.attackPower;});}
 const refs=[];for(const [ordinal,data]of [[0,cp.role],[1,cp.scene]]){const chunk=await writeChunk(ch,ordinal,cp.header.activeChunks[ordinal].chunkRevision+1,data);tx.set(chunk.id,chunk);refs.push({...cp.header.activeChunks[ordinal],chunkRevision:chunk.chunkRevision,hash:chunk.hash});}tx.set(cp.header.id,{...cp.header,roomNo:6,activeChunks:[...refs,...cp.header.activeChunks.slice(2)],state:{...cp.header.state,publicStateHash:await stateHash(cp.role,cp.scene)}});tx.set(ch.id,ch);
 const room=await tx.get(await loginKey('room',[ch.id,0])),id=await loginKey('room',[ch.id,6]);tx.set(id,{...room,id,roomNo:6});
 const c=await tx.get(h.characterId),w=await tx.get(c.equipped.weapon);tx.set(w.id,{...w,durability:{...w.durability,current:1}});
 });
 const rewardConfig={profile:'local-test-kill-rewards',authorization:'isolated-local-assets-only',ref:'kill-rewards-test-v1',goldPerKill:'10',xpPerKill:5,roomWear:1},content={...h.content,drops:h.drops,...rewards?{rewards:rewardConfig}:{}};
 const service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content});
 const query=()=>service.query({...h.auth,query:'challenge.get',requestId:'state',payload:{challengeId:h.challengeId}});
 async function command(operationId='boss-kill'){const q=await h.command([{kind:'basic',pressed:true}],50,operationId);q.payload.roomNo=6;q.payload.digest=await manifestDigest({payload:Object.fromEntries(Object.entries(q.payload).filter(([k])=>k!=='digest')),config:h.config,combat:h.profile});return q;}
 const cp=()=>h.store.run(async tx=>readCheckpoint(tx,await tx.get(h.challengeId)));
 h.clock.now=()=>1513;
 return {...h,content,service,query,command,cp};
}
