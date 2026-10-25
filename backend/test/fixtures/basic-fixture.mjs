import {prepareFixture} from './prepare-fixture.mjs';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
import {TRAINING_BASIC_CONFIG} from '../../../shared/src/basic-combat-kernel.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
import {loginKey} from '../../src/identity/identity-v2.ts';
export async function basicFixture(profilePatch={}){
 const h=await prepareFixture(),config={schemaVersion:1,profile:'local-test-movement',units:'milli-design-pixel',ruleRef:'movement-test@1',mapRef:'first-room-1@1',walkSpeed:1001,runSpeed:3001,ySpeed:701,deadzone:100,runThreshold:600,footprint:10,bounds:{minX:-1000000,maxX:1000000,minY:-1000000,maxY:1000000},walls:[]};
 const profile={schemaVersion:1,profile:'local-test-basic',capabilities:['basic','no-rewards'],config:{...structuredClone(TRAINING_BASIC_CONFIG),rangeX:500000,rangeY:500000},attributes:{attackPowerByLevel:Array(30).fill('1000'),haste:{n:'1',d:'1'},damageBonus:{n:'0',d:'1'},hit:{n:'1',d:'1'},crit:{n:'0',d:'1'},critMultiplier:{n:'2',d:'1'}},targets:Object.fromEntries(h.content.release.nodes.filter(n=>n.kind==='monster').map(n=>[`${n.id}@${n.version}`,{mitigation:{n:'0',d:'1'},evasion:{n:'0',d:'1'},damageImmune:false}])),...profilePatch};
 const content={...h.content,movement:config,combat:profile},service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content});
 const prepared=await service.execute(h.command);if(prepared.outcome.status!=='committed')throw Error(JSON.stringify(prepared));const manifest=prepared.outcome.data;config.mapRef=manifest.mapRef;
 // Profile map is explicit before activation; no hidden movement defaults.
 const activeService=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content:{...content,movement:config}});
 const activated=await activeService.execute({...h.auth,command:'challenge.activateRoom',operationId:'activate',expected:prepared.outcome.resultVersions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomAttemptId:manifest.roomAttemptId,manifestHash:manifest.manifestHash,expectedRevision:1}});
 h.clock.now=()=>1013;const ready=await activeService.execute({...h.auth,command:'scene.ready',controlSeq:1,leaseRevision:0,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,...Object.fromEntries(Object.entries(activated.outcome.data.readyTicket).filter(([k])=>k!=='deadline'))}});
 if(ready.outcome.status!=='committed')throw Error(JSON.stringify(ready));
 const query=()=>activeService.query({...h.auth,query:'challenge.get',requestId:'state',payload:{challengeId:h.challengeId}}),headerId=await loginKey('cpHeader',[h.challengeId]);
 const base={...h.auth,query:'simulation.confirmed',requestId:'proof',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,sceneEpoch:1,timelineEpoch:1,checkpointRevision:ready.outcome.data.state.checkpointRevision,pageIndex:0}};
 async function command(inputs=[{kind:'basic',pressed:true}],ticks=50,operationId='basic'){
  const state=(await query()).data,firstSeq=state.acceptedSeq+1,payload={characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId:h.challengeId,roomNo:0,sceneEpoch:state.sceneEpoch,timelineEpoch:state.timelineEpoch,baseCheckpointVersion:state.checkpointRevision,firstSeq,lastSeq:firstSeq+inputs.length-1,fromTick:state.acceptedTick,toTick:state.acceptedTick+ticks,ruleRef:config.ruleRef,mapRef:config.mapRef,inputs:inputs.map((a,i)=>({...a,seq:firstSeq+i,tick:a.tick??state.acceptedTick})),digest:''};
  payload.digest=await manifestDigest({payload:Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='digest')),config,combat:profile});return {...h.auth,command:'simulation.submit',operationId,expected:(await query()).versions,payload};
 }
 async function results(operationId='basic'){const first=await activeService.query({...h.auth,query:'simulation.actionResults',requestId:'results',payload:{operationId,pageIndex:0}}),pages=[first];for(let i=1;i<first.totalPages;i++)pages.push(await activeService.query({...h.auth,query:'simulation.actionResults',requestId:`results-${i}`,payload:{operationId,pageIndex:i}}));return pages.flatMap(p=>p.events);}
 return {...h,content:{...content,movement:config},service:activeService,config,profile,query,command,base,results,headerId,ready,manifest,prepareCommand:h.command};
}
