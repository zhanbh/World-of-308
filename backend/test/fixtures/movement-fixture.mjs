import {prepareFixture} from './prepare-fixture.mjs';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
import {loginKey} from '../../src/identity/identity-v2.ts';
export async function movementFixture(){
 const h=await prepareFixture();
 const prepared=await h.service.execute(h.command),manifest=prepared.outcome.data;
 const activated=await h.service.execute({...h.auth,command:'challenge.activateRoom',operationId:'activate',expected:prepared.outcome.resultVersions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:manifest.roomAttemptId,manifestHash:manifest.manifestHash,expectedRevision:1}});
 h.clock.now=()=>1013;
 const ready=await h.service.execute({...h.auth,command:'scene.ready',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(activated.outcome.data.readyTicket).filter(([k])=>k!=='deadline'))}});
 const config={schemaVersion:1,profile:'local-test-movement',units:'milli-design-pixel',ruleRef:'movement-test@1',mapRef:manifest.mapRef,walkSpeed:1001,runSpeed:3001,ySpeed:701,deadzone:100,runThreshold:600,footprint:10,bounds:{minX:-1000000,maxX:1000000,minY:-1000000,maxY:1000000},walls:[]};
 const content={...h.content,movement:config},service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content});
 const base={...h.auth,query:'simulation.confirmed',requestId:'proof',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1,checkpointRevision:ready.outcome.data.state.checkpointRevision,pageIndex:0}};
 const headerId=await loginKey('cpHeader',[h.challengeId]);
 async function command(inputs=[{kind:'move',x:1000,y:0}],ticks=50,operationId='move'){
  const state=(await h.query()).data,header=h.store.inspect(headerId),firstSeq=state.acceptedSeq+1;
  const payload={characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomNo:0,sceneEpoch:state.sceneEpoch,timelineEpoch:state.timelineEpoch,baseCheckpointVersion:state.checkpointRevision,firstSeq,lastSeq:firstSeq+inputs.length-1,fromTick:state.acceptedTick,toTick:state.acceptedTick+ticks,ruleRef:config.ruleRef,mapRef:config.mapRef,inputs:inputs.map((a,i)=>({...a,seq:firstSeq+i,tick:state.acceptedTick})),digest:''};
  payload.digest=await manifestDigest({payload:Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='digest')),config});
  return {...h.auth,command:'simulation.submit',operationId,expected:(await h.query()).versions,payload};
 }
 return {...h,service,config,base,command,ready,headerId,manifest,prepareCommand:h.command};
}
