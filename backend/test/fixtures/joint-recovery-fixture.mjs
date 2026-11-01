import assert from 'node:assert/strict';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
import {LoadingCoordinator} from '../../../client/assets/scripts/net/LoadingCoordinator.ts';
import {MovementCoordinator} from '../../../client/assets/scripts/net/MovementCoordinator.ts';
import {LootSceneCoordinator} from '../../../client/assets/scripts/net/LootSceneCoordinator.ts';
import {CombatRecoveryCoordinator} from '../../../client/assets/scripts/net/CombatRecoveryCoordinator.ts';
import {CombatLifecycleAdapter} from '../../../client/assets/scripts/net/CombatLifecycleAdapter.ts';
export const bytes=value=>Buffer.byteLength(JSON.stringify(value));
/** Records actual transaction calls (including duplicate set calls), never estimates SDK cost. */
export function recoveryMeter(h){
 const attempts=[];
 const service=new ChallengeService({store:{run:fn=>h.store.run(async tx=>{
  const reads=new Set(),writes=new Map();let getCalls=0,setCalls=0;const readCallsByKind={};
  const result=await fn({get:async id=>{reads.add(id);getCalls++;const kind=id.split(':')[1];readCallsByKind[kind]=(readCallsByKind[kind]??0)+1;return tx.get(id);},set:(id,v)=>{setCalls++;writes.set(id,bytes(v));tx.set(id,v);}});
  attempts.push({R:reads.size,W:writes.size,readCallsByKind,getCalls,setCalls,calls:getCalls+setCalls,bytes:[...writes.values()].reduce((a,b)=>a+b,0),maxWrite:Math.max(0,...writes.values()),writeKeys:[...writes.keys()]});return result;
 })},clock:h.clock,identity:h.identity,content:h.content});
 return {service,attempts};
}
export async function attachRecovery(h,{lose=null,service=h.service}={}){
 const saved=new Map(),persistence={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)},ch=h.store.inspect(h.challengeId);
 let now=h.clock.now(),seq=ch.controlSeq,loss=lose;const calls=[];
 const transport={send:async text=>{const q=JSON.parse(text),r=await(q.query?service.query(q):service.execute(q));calls.push({kind:q.command??q.query,responseBytes:bytes(r),pages:r.totalPages??r.total??null});if(loss===q.command){loss=null;throw Error('lost committed '+q.command);}return JSON.stringify(r);},queryOriginalControl:async text=>{const r=await service.queryOriginalControl(JSON.parse(text));calls.push({kind:'originalControl',responseBytes:bytes(r)});return JSON.stringify(r);}};
 const context={...h.auth,characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId};
 const loading=new LoadingCoordinator(transport,persistence,{load:(ref,release)=>service.resolveResource(release,ref)});await loading.prepare(h.prepareCommand);assert.equal(loading.state.status,'loaded');
 const movement=new MovementCoordinator(transport,persistence,{now:()=>now});
 const {attackPowerByLevel,...rest}=h.profile.attributes,basic={profile:h.profile,cross:{level:20,controlled:false},stats:{attackPower:attackPowerByLevel[0],...rest,x:0,y:0,facing:1},targetRules:Object.fromEntries((await h.cp()).scene.enemies.map(e=>[e.actor.actorId,{mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false,controlImmune:false}]))};
 const loot=new LootSceneCoordinator(movement,transport,persistence,context),owner=new CombatRecoveryCoordinator(transport,persistence,movement,loading,[loot.drops,loot.terminal]);owner.init(context,h.config,ch.currentRoomNo,basic);await movement.resumeActive(context,h.config,ch.currentRoomNo,basic);await loot.open();
 const adapter=new CombatLifecycleAdapter(owner,movement,loot,async(command,extra)=>{
  // Read current lease after unknown asset/input writes; never guess a revision.
  const status=JSON.parse(await transport.send(JSON.stringify({...h.auth,command:'scene.status',controlSeq:seq+1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId,readyTicketId:null}})));
  const payload={characterId:h.characterId,rolePlayEpoch:ch.rolePlayEpoch,challengeId:h.challengeId,...extra};
  return {...h.auth,command,controlSeq:++seq,leaseRevision:status.leaseRevision,payload};
 },()=>{},()=>{},()=>now);
 return {adapter,movement,loot,owner,calls,persistence,setNow:value=>{now=value;h.clock.now=()=>value;},lose:command=>{loss=command;}};
}
