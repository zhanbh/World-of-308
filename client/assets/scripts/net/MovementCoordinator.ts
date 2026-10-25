import {advanceBengshanSimulation} from '../../../../shared/src/bengshan-simulation.ts';
import {restoreBengshanPublic} from '../../../../shared/src/bengshan-combat-kernel.ts';
import type {BengshanState} from '../../../../shared/src/bengshan-combat-kernel.ts';
import {advanceCrossSimulation} from '../../../../shared/src/cross-simulation.ts';
import {restoreCrossPublic} from '../../../../shared/src/cross-combat-kernel.ts';
import type {CrossState} from '../../../../shared/src/cross-combat-kernel.ts';
import {encodeSceneMessage,decodeSceneReply} from '../../../../shared/src/protocol/scene-wire.ts';
import {advanceBasicSimulation} from '../../../../shared/src/basic-simulation.ts';
import {initialCombatState} from '../../../../shared/src/basic-combat-kernel.ts';
import type {CombatState,CombatStats,CombatTarget,CombatEvent} from '../../../../shared/src/basic-combat-kernel.ts';
import type {BasicTrainingProfile} from '../../../../backend/src/challenge/basic-training.ts';
import {advanceMovement} from '../../../../shared/src/movement-kernel.ts';
import type {MovementConfig,MovementState} from '../../../../shared/src/movement-kernel.ts';
import {decodeSimulationSubmit} from '../../../../shared/src/protocol/simulation-v2.ts';
import type {ActionInput,SimulationSubmit} from '../../../../shared/src/protocol/simulation-v2.ts';
import {parseSimulationResponse,parseChallengeQueryResponse,parseRecoveryPage,parseActionResultsPage} from '../../../../shared/src/protocol/scene-v2.ts';
import type {SceneState} from '../../../../shared/src/protocol/scene-v2.ts';
import {parseAssetQueryResponse} from '../../../../shared/src/protocol/asset-v2.ts';
import {verifyRecoveryPages} from '../../../../shared/src/public-state-proof.ts';
import {manifestDigest} from '../../../../shared/src/room-manifest.ts';
import type {EntryTransport,EntryPendingStore} from './ChallengeEntryCoordinator.ts';
import type {LoadingCoordinator} from './LoadingCoordinator.ts';
type Context={protocolVersion:2;sessionId:string;sessionEpoch:number;characterId:string;rolePlayEpoch:number;challengeId:string};
type Queued=ActionInput;
export type BasicPrediction={profile:BasicTrainingProfile;stats:CombatStats;cross?:{level:number;controlled:boolean};targetRules:Record<string,{mitigation:CombatTarget['mitigation'];evasion:CombatTarget['evasion'];damageImmune:boolean;controlImmune:boolean}>};
export interface MovementClientState {status:'loading'|'empty'|'error'|'submitting'|'unknown'|'stale'|'active'|'frozen';code:string|null;predictionEnabled:boolean;confirmed:SceneState|null;position:MovementState|null;queued:number;combat:CombatState|null;targets:CombatTarget[];actionResults:CombatEvent[];cross?:CrossState|null;bengshan?:BengshanState|null;}
/** Durable original intent, current public proof, and a bounded prediction clock. */
export class MovementCoordinator {
 private transport:EntryTransport;private persistence:EntryPendingStore;private clock:{now():number};
 private context:Context|null=null;private config:MovementConfig|null=null;private generation=0;private pending:SimulationSubmit|null=null;private knownRejected=false;private queue:Queued[]=[];
 private basic:BasicPrediction|null=null;private confirmedCombat:CombatState|null=null;private confirmedTargets:CombatTarget[]=[];
 private confirmedBengshan:BengshanState|null=null;private confirmedCross:CrossState|null=null;private confirmedMp='0';
 private confirmedPosition:MovementState|null=null;private confirmedAt=0;private versions:SimulationSubmit['expected']=[];
 private current:MovementClientState={status:'loading',code:null,predictionEnabled:false,confirmed:null,position:null,queued:0,combat:null,targets:[],actionResults:[]};
 constructor(transport:EntryTransport,persistence:EntryPendingStore,clock:{now():number}){this.transport=transport;this.persistence=persistence;this.clock=clock;}
 get state(){this.guardClock();return structuredClone(this.current);}
 private async scene(q:unknown){const text=await this.transport.send(encodeSceneMessage(q));decodeSceneReply(q,text);return JSON.parse(text) as unknown;}
 private key(){return JSON.stringify(['movement',this.context]);}
 private save(){this.persistence.save(this.key(),this.pending?JSON.stringify(this.pending):null);}
 private guardClock(){if(this.current.predictionEnabled&&this.clock.now()-this.confirmedAt>=1000){this.current.predictionEnabled=false;this.current.status='frozen';}}
 async load(context:Context,config:MovementConfig,loading:LoadingCoordinator,basic?:BasicPrediction){
  const generation=++this.generation;this.context=structuredClone(context);this.config=structuredClone(config);this.basic=basic?structuredClone(basic):null;this.confirmedCombat=null;this.confirmedCross=null;this.confirmedBengshan=null;this.confirmedTargets=[];this.queue=[];this.pending=null;this.knownRejected=false;this.confirmedPosition=null;
  this.current={status:'loading',code:null,predictionEnabled:false,confirmed:null,position:null,queued:0,combat:null,targets:[],actionResults:[]};
  if(loading.state.status!=='loaded'||loading.state.manifest?.challengeId!==context.challengeId||loading.state.manifest.mapRef!==config.mapRef){this.current.status='empty';this.current.code='RESOURCES_NOT_LOADED';return;}
  this.roomNo=loading.state.manifest.roomNo;
  const saved=this.persistence.load(this.key());if(saved!==null){this.pending=decodeSimulationSubmit(saved);if(this.pending.sessionId!==context.sessionId||this.pending.sessionEpoch!==context.sessionEpoch||this.pending.payload.characterId!==context.characterId||this.pending.payload.rolePlayEpoch!==context.rolePlayEpoch||this.pending.payload.challengeId!==context.challengeId)throw Error('PENDING_CONTEXT_MISMATCH');this.current.status='unknown';await this.retry();return;}
  try{await this.refresh(generation);}catch(e){if(generation===this.generation){this.current.status=e instanceof Error&&e.message==='STALE_STATE'?'stale':'error';this.current.code=e instanceof Error?e.message:'LOAD_FAILED';this.current.predictionEnabled=false;}}
 }
 private async refresh(generation=this.generation){
  const c=this.context!,config=this.config!,query={protocolVersion:2,sessionId:c.sessionId,sessionEpoch:c.sessionEpoch,query:'challenge.get',requestId:'movement-current',payload:{challengeId:c.challengeId}};
  const first=parseChallengeQueryResponse(await this.scene(query));if(generation!==this.generation)return;
  if('error' in first)throw Error(first.error.code);const s=first.data;
  if('kind' in s||s.roomPhase!=='active'||s.connection!=='connected'||s.lifeState!=='alive'||s.result!=='active')throw Error('CURRENT_SCENE_NOT_ACTIVE');
  if(this.current.confirmed&&(s.sceneEpoch!==this.current.confirmed.sceneEpoch||s.timelineEpoch!==this.current.confirmed.timelineEpoch||s.checkpointRevision<this.current.confirmed.checkpointRevision))throw Error('STALE_STATE');
  const pages=[];let total=1;
  for(let pageIndex=0;pageIndex<total;pageIndex++){
   const page=parseRecoveryPage(await this.scene({protocolVersion:2,sessionId:c.sessionId,sessionEpoch:c.sessionEpoch,query:'simulation.confirmed',requestId:`movement-page-${pageIndex}`,payload:{characterId:c.characterId,rolePlayEpoch:c.rolePlayEpoch,challengeId:c.challengeId,sceneEpoch:s.sceneEpoch,timelineEpoch:s.timelineEpoch,checkpointRevision:s.checkpointRevision,pageIndex}}));
   if(generation!==this.generation)return;pages.push(page);total=page.totalPages;
  }
  const proof=await verifyRecoveryPages(pages);if(generation!==this.generation)return;
  if(proof.checkpointRevision!==s.checkpointRevision||proof.publicStateHash!==s.publicStateHash||proof.sceneEpoch!==s.sceneEpoch||proof.timelineEpoch!==s.timelineEpoch||proof.manifestHash!==s.manifestHash)throw Error('PROOF_MISMATCH');
  const final=parseChallengeQueryResponse(await this.scene(query));if(generation!==this.generation)return;
  if('error' in final||'kind' in final.data||final.data.checkpointRevision!==s.checkpointRevision||final.data.publicStateHash!==s.publicStateHash||final.data.connection!=='connected'||final.data.roomPhase!=='active')throw Error('STALE_STATE');
  const actor=proof.records.find(r=>r.kind==='actor'&&r.actorId===c.characterId),movement=proof.records.find(r=>r.kind==='movement'&&r.actorId===c.characterId);
  if(!actor||actor.kind!=='actor')throw Error('INCOMPLETE_PUBLIC_STATE');
  if(movement&&movement.kind==='movement'&&movement.configHash!==await manifestDigest(config))throw Error('CONFIG_MISMATCH');if(generation!==this.generation)return;
  const m=movement?.kind==='movement'?movement:null;this.confirmedPosition={x:String(actor.x),y:String(actor.y),facing:actor.facing,intentX:m?.intentX??0,intentY:m?.intentY??0,remainderX:m?.remainderX??'0',remainderY:m?.remainderY??'0'};
  if(!this.basic&&proof.records.some(r=>r.kind==='combatAction'))throw Error('COMBAT_CONFIG_MISSING');
  if(this.basic){
   const action=proof.records.find(r=>r.kind==='combatAction'&&r.actorId===c.characterId);
   if(!action||action.kind!=='combatAction'||action.configHash!==await manifestDigest(this.basic.profile))throw Error('COMBAT_CONFIG_MISMATCH');if(generation!==this.generation)return;
   this.confirmedCombat={...initialCombatState(),held:action.held,buffered:action.buffered,nextStage:action.nextStage,comboExpiresUs:action.comboExpiresUs,castSequence:action.castSequence,cast:action.cast?(()=>{const {facing,...cast}=action.cast;return {...cast,snapshot:{...structuredClone(this.basic!.stats),facing}};})():null};
   this.confirmedTargets=proof.records.filter(r=>r.kind==='actor'&&r.actorId!==c.characterId).map(r=>{
    if(r.kind!=='actor')throw Error('INCOMPLETE_PUBLIC_STATE');const rule=this.basic!.targetRules[r.actorId],control=proof.records.find(v=>v.kind==='targetControl'&&v.actorId===r.actorId);
    if(!rule||!control||control.kind!=='targetControl')throw Error('TARGET_CONFIG_MISSING');
    return {actorIndex:r.actorIndex,actorId:r.actorId,x:r.x,y:r.y,hp:r.hp,maxHp:r.maxHp,lifeState:r.lifeState,...rule,directSinceRise:control.directSinceRise,downUntilTick:control.downUntilTick};
   });
  }
  this.confirmedMp=actor.mp;if(this.basic?.profile.cross){const action=proof.records.find(r=>r.kind==='crossAction'&&r.actorId===c.characterId);if(!action||action.kind!=='crossAction'||!this.basic.cross)throw Error('CROSS_STATE_MISSING');const effectRecords=proof.records.filter(r=>r.kind==='crossEffect'&&r.actorId===c.characterId);const effects=effectRecords.map((r,index)=>{if(r.kind!=='crossEffect'||r.index!==index||r.state.castSequence!==action.state.castSequence||JSON.stringify(r.state.readyAtUs)!==JSON.stringify(action.state.readyAtUs))throw Error('CROSS_EFFECT_MISMATCH');return r.state.effects[0];});this.confirmedCross=restoreCrossPublic({...action.state,effects},{...this.basic.stats,...this.basic.cross,mastery:this.basic.profile.mastery!,mp:actor.mp});}
  if(this.basic?.profile.bengshan){const action=proof.records.find(r=>r.kind==='bengshanAction'&&r.actorId===c.characterId);if(!action||action.kind!=='bengshanAction'||!this.basic.cross)throw Error('BENGSHAN_STATE_MISSING');const effects=proof.records.filter(r=>r.kind==='bengshanEffect'&&r.actorId===c.characterId).map((r,index)=>{if(r.kind!=='bengshanEffect'||r.index!==index||r.state.castSequence!==action.state.castSequence||JSON.stringify(r.state.readyAtUs)!==JSON.stringify(action.state.readyAtUs))throw Error('BENGSHAN_EFFECT_MISMATCH');return r.state.effects[0];});this.confirmedBengshan=restoreBengshanPublic({...action.state,effects},{...this.basic.stats,...this.basic.cross,mastery:this.basic.profile.mastery!,mp:actor.mp});}
  this.versions=final.versions;this.confirmedAt=this.clock.now();this.current={status:'active',code:null,predictionEnabled:true,confirmed:s,position:structuredClone(this.confirmedPosition),queued:0,combat:structuredClone(this.confirmedCombat),targets:structuredClone(this.confirmedTargets),actionResults:this.current.actionResults,cross:structuredClone(this.confirmedCross),bengshan:structuredClone(this.confirmedBengshan)};
 }
 enqueue(input:ActionInput){
  this.guardClock();if(!this.current.predictionEnabled||!this.current.confirmed||this.pending)throw Error('PREDICTION_FROZEN');
  if(input.tick<this.current.confirmed.acceptedTick||input.tick>=this.current.confirmed.acceptedTick+100)throw Error('INPUT_TIME_BOUND');
  const previous=this.queue.at(-1);if(previous&&input.tick<previous.tick)throw Error('INPUT_ORDER');
  if(input.kind==='move'&&previous?.kind==='move'&&previous.tick===input.tick)this.queue[this.queue.length-1]=structuredClone(input);
  else {if(this.queue.length>=32)throw Error('INPUT_QUEUE_FULL');this.queue.push(structuredClone(input));}
  this.current.queued=this.queue.length;
 }
 predict(toTick:number){this.guardClock();if(!this.current.predictionEnabled||!this.confirmedPosition||!this.current.confirmed)return;
  const from=this.current.confirmed.acceptedTick;if(toTick-from>Math.min(100,Math.floor((this.clock.now()-this.confirmedAt)/10)))throw Error('PREDICTION_FRONTIER');
  if(this.basic?.profile.bengshan&&this.basic.profile.cross&&this.confirmedBengshan&&this.basic.cross&&this.confirmedCombat&&this.confirmedCross){const result=advanceBengshanSimulation(this.confirmedPosition,this.confirmedCombat,this.confirmedCross,this.confirmedBengshan,this.confirmedTargets,this.queue.filter(i=>i.tick<toTick),from,toTick,this.config!,this.basic.profile.config,this.basic.profile.cross,this.basic.profile.bengshan,{challengeId:this.context!.challengeId,sceneEpoch:this.current.confirmed.sceneEpoch,actorId:this.context!.characterId},{...this.basic.stats,...this.basic.cross,mastery:this.basic.profile.mastery!,mp:this.confirmedMp},()=>0);this.current.position=result.movement;this.current.combat=result.state;this.current.cross=result.cross;this.current.bengshan=result.bengshan;this.current.targets=result.targets;return;}
  if(this.basic?.profile.cross&&this.basic.cross&&this.confirmedCombat&&this.confirmedCross){const result=advanceCrossSimulation(this.confirmedPosition,this.confirmedCombat,this.confirmedCross,this.confirmedTargets,this.queue.filter(i=>i.tick<toTick),from,toTick,this.config!,this.basic.profile.config,this.basic.profile.cross,{challengeId:this.context!.challengeId,sceneEpoch:this.current.confirmed.sceneEpoch,actorId:this.context!.characterId},{...this.basic.stats,...this.basic.cross,mastery:this.basic.profile.mastery!,mp:this.confirmedMp},()=>0);this.current.position=result.movement;this.current.combat=result.state;this.current.cross=result.cross;this.current.targets=result.targets;return;}
  if(this.basic&&this.confirmedCombat){const result=advanceBasicSimulation(this.confirmedPosition,this.confirmedCombat,this.confirmedTargets,this.queue.filter(i=>i.tick<toTick),from,toTick,this.config!,this.basic.profile.config,{challengeId:this.context!.challengeId,sceneEpoch:this.current.confirmed.sceneEpoch,actorId:this.context!.characterId},this.basic.stats,()=>0);this.current.position=result.movement;this.current.combat=result.state;this.current.targets=result.targets;return;}
  this.current.position=advanceMovement(this.confirmedPosition,this.queue.filter(i=>i.tick<toTick),from,toTick,this.config!).state;
 }
 async submit(operationId:string,toTick:number){
  this.guardClock();if(!this.current.confirmed||!this.config||!this.context||this.pending)throw Error('PENDING_INPUT');
  const generation=this.generation,s=this.current.confirmed,c=this.context,inputs=this.queue.map((v,i)=>({...v,seq:s.acceptedSeq+i+1}));
  if(inputs.some(i=>i.tick>=toTick))throw Error('INPUT_TIME_BOUND');
  const payload={characterId:c.characterId,rolePlayEpoch:c.rolePlayEpoch,challengeId:c.challengeId,roomNo:0,sceneEpoch:s.sceneEpoch,timelineEpoch:s.timelineEpoch,baseCheckpointVersion:s.checkpointRevision,firstSeq:s.acceptedSeq+1,lastSeq:s.acceptedSeq+inputs.length,fromTick:s.acceptedTick,toTick,ruleRef:this.config.ruleRef,mapRef:this.config.mapRef,inputs,digest:''};
  // roomNo is supplied by the loaded resource manifest and retained with configuration below.
  payload.roomNo=this.roomNo;
  payload.digest=await manifestDigest({payload:Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='digest')),config:this.config,...(this.basic?{combat:this.basic.profile}:{})});
  if(generation!==this.generation)return;
  this.pending=decodeSimulationSubmit(JSON.stringify({protocolVersion:2,sessionId:c.sessionId,sessionEpoch:c.sessionEpoch,command:'simulation.submit',operationId,expected:this.versions,payload}));this.save();this.queue=[];await this.retry(false);
 }
 private roomNo=0;
 async retry(recover=true){
  if(!this.pending||!this.context)throw Error('NO_PENDING_INPUT');const generation=this.generation,q=this.pending;
  this.current.status='submitting';this.current.predictionEnabled=false;
  try{
   let original:ReturnType<typeof parseSimulationResponse>|null=null;
   if(recover){const r=parseAssetQueryResponse('operation.get',JSON.parse(await this.transport.send(JSON.stringify({protocolVersion:2,sessionId:q.sessionId,sessionEpoch:q.sessionEpoch,query:'operation.get',requestId:`original-${q.operationId}`.slice(0,64),payload:{operationId:q.operationId}}))));if(generation!==this.generation)return;if('error' in r)throw Error(r.error.code);if(r.data.status==='found'){if(r.data.command!=='simulation.submit')throw Error('OPERATION_MISMATCH');original=parseSimulationResponse(r.data.result);}}
   const result=original??parseSimulationResponse(await this.scene(q));if(generation!==this.generation)return;
   if(result.operationId!==q.operationId)throw Error('OPERATION_MISMATCH');
   if(result.outcome.status==='unknown'){this.current.status='unknown';return;}
   if(result.outcome.status==='rejected'){this.knownRejected=true;this.current.status='error';this.current.code=result.outcome.code;return;}
   await this.refresh(generation);if(generation!==this.generation)return;
   if(this.current.confirmed!.checkpointRevision<result.outcome.data.checkpointRevision)throw Error('STALE_STATE');
   if(this.basic){
    this.current.status='submitting';this.current.predictionEnabled=false;
    const actionResults:CombatEvent[]=[];let totalPages=1,expectedTotal:number|null=null;
    for(let pageIndex=0;pageIndex<totalPages;pageIndex++){
     const page=parseActionResultsPage(await this.scene({protocolVersion:2,sessionId:q.sessionId,sessionEpoch:q.sessionEpoch,query:'simulation.actionResults',requestId:`combat-results-${pageIndex}`,payload:{operationId:q.operationId,pageIndex}}));
     if(generation!==this.generation)return;if(page.actionResultsRef!==result.outcome.data.actionResultsRef||(expectedTotal!==null&&page.totalPages!==expectedTotal))throw Error('ACTION_RESULTS_MISMATCH');expectedTotal=page.totalPages;totalPages=page.totalPages;actionResults.push(...page.events);
    }
    if(new Set(actionResults.map(e=>e.eventId)).size!==actionResults.length)throw Error('ACTION_RESULTS_MISMATCH');
    this.current.actionResults=actionResults;this.current.status='active';this.current.predictionEnabled=true;
   }
   this.pending=null;this.save();
  }catch(e){if(generation!==this.generation)return;this.current.status='unknown';this.current.code=e instanceof Error?e.message:'NETWORK_ERROR';this.current.predictionEnabled=false;}
 }
 async reconcileRejected(){if(!this.pending||!this.knownRejected||this.current.status!=='error')throw Error('ORIGINAL_RESULT_REQUIRED');const generation=this.generation;try{await this.refresh(generation);if(generation!==this.generation)return;this.pending=null;this.knownRejected=false;this.queue=[];this.save();}catch(e){if(generation!==this.generation)return;this.current.status='error';this.current.predictionEnabled=false;this.current.code=e instanceof Error?e.message:'RECONCILE_FAILED';}}

}
