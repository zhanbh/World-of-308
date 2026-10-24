import {ChallengeService} from '../../src/challenge/challenge-service.ts';
import {loginKey} from '../../src/identity/identity-v2.ts';
import {writeChunk,stateHash} from '../../src/challenge/room-checkpoint.ts';
/** Admitted server-side cleared/exit fixture; no client clear command is exposed. */
export async function markCleared(h){
 h.service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:{...h.content,exitInteraction:{profile:'local-test',rulesRef:h.content.releaseRef,radius:0}}});
 const headerId=await loginKey('cpHeader',[h.challengeId]),roleId=await loginKey('cpChunk',[h.challengeId,0]),sceneId=await loginKey('cpChunk',[h.challengeId,1]);
 await h.store.run(async tx=>{const old=await tx.get(h.challengeId),header=await tx.get(headerId),role=(await tx.get(roleId)).data,scene=(await tx.get(sceneId)).data;
 role.player.x=200000;role.player.y=20000;role.player.hp='1000';role.cooldowns.forEach(cd=>cd.readyAtTick=500);scene.enemies.forEach(e=>{e.actor.hp='0';e.actor.lifeState='dead';});
 const chunks=await Promise.all([writeChunk(old,0,1,role),writeChunk(old,1,1,scene)]);for(const ch of chunks)tx.set(ch.id,ch);
 tx.set(headerId,{...header,activeChunks:chunks.map(ch=>({ordinal:ch.ordinal,chunkRevision:1,hash:ch.hash,sceneEpoch:old.sceneEpoch})),state:{...header.state,roomPhase:'cleared',publicStateHash:await stateHash(role,scene)}});tx.set(old.id,{...old,roomPhase:'cleared',staminaSnapshot:{...old.staminaSnapshot,remaining:0}});
 });
}
