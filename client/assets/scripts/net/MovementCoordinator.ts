import {encodeSceneMessage,decodeSceneReply} from '../../../../shared/src/protocol/scene-wire.ts';
import {advanceMovement} from '../../../../shared/src/movement-kernel.ts';
import type {MovementConfig,MovementState} from '../../../../shared/src/movement-kernel.ts';
import {decodeSimulationSubmit} from '../../../../shared/src/protocol/simulation-v2.ts';
import type {ActionInput,SimulationSubmit} from '../../../../shared/src/protocol/simulation-v2.ts';
import {parseSimulationResponse,parseChallengeQueryResponse,parseRecoveryPage} from '../../../../shared/src/protocol/scene-v2.ts';
import type {SceneState} from '../../../../shared/src/protocol/scene-v2.ts';
import {parseAssetQueryResponse} from '../../../../shared/src/protocol/asset-v2.ts';
import {verifyRecoveryPages} from '../../../../shared/src/public-state-proof.ts';
import {manifestDigest} from '../../../../shared/src/room-manifest.ts';
import type {EntryTransport,EntryPendingStore} from './ChallengeEntryCoordinator.ts';
import type {LoadingCoordinator} from './LoadingCoordinator.ts';
type Context={protocolVersion:2;sessionId:string;sessionEpoch:number;characterId:string;rolePlayEpoch:number;challengeId:string};
type Queued=ActionInput;
export interface MovementClientState {status:'loading'|'empty'|'error'|'submitting'|'unknown'|'stale'|'active'|'frozen';code:string|null;predictionEnabled:boolean;confirmed:SceneState|null;position:MovementState|null;queued:number;}
/** Durable original intent, current public proof, and a bounded prediction clock. */
export class MovementCoordinator {
 private transport:EntryTransport;private persistence:EntryPendingStore;private clock:{now():number};
 private context:Context|null=null;private config:MovementConfig|null=null;private generation=0;private pending:SimulationSubmit|null=null;private knownRejected=false;private queue:Queued[]=[];
 private confirmedPosition:MovementState|null=null;private confirmedAt=0;private versions:SimulationSubmit['expected']=[];
 private current:MovementClientState={status:'loading',code:null,predictionEnabled:false,confirmed:null,position:null,queued:0};
 constructor(transport:EntryTransport,persistence:EntryPendingStore,clock:{now():number}){this.transport=transport;this.persistence=persistence;this.clock=clock;}
 get state(){this.guardClock();return structuredClone(this.current);}
 private async scene(q:unknown){const text=await this.transport.send(encodeSceneMessage(q));decodeSceneReply(q,text);return JSON.parse(text) as unknown;}
 private key(){return JSON.stringify(['movement',this.context]);}
 private save(){this.persistence.save(this.key(),this.pending?JSON.stringify(this.pending):null);}
 private guardClock(){if(this.current.predictionEnabled&&this.clock.now()-this.confirmedAt>=1000){this.current.predictionEnabled=false;this.current.status='frozen';}}
 async load(context:Context,config:MovementConfig,loading:LoadingCoordinator){
  const generation=++this.generation;this.context=structuredClone(context);this.config=structuredClone(config);this.queue=[];this.pending=null;this.knownRejected=false;this.confirmedPosition=null;
  this.current={status:'loading',code:null,predictionEnabled:false,confirmed:null,position:null,queued:0};
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
  this.versions=final.versions;this.confirmedAt=this.clock.now();this.current={status:'active',code:null,predictionEnabled:true,confirmed:s,position:structuredClone(this.confirmedPosition),queued:0};
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
  this.current.position=advanceMovement(this.confirmedPosition,this.queue.filter(i=>i.tick<toTick),from,toTick,this.config!).state;
 }
 async submit(operationId:string,toTick:number){
  this.guardClock();if(!this.current.confirmed||!this.config||!this.context||this.pending)throw Error('PENDING_INPUT');
  const generation=this.generation,s=this.current.confirmed,c=this.context,inputs=this.queue.map((v,i)=>({...v,seq:s.acceptedSeq+i+1}));
  if(inputs.some(i=>i.tick>=toTick))throw Error('INPUT_TIME_BOUND');
  const payload={characterId:c.characterId,rolePlayEpoch:c.rolePlayEpoch,challengeId:c.challengeId,roomNo:0,sceneEpoch:s.sceneEpoch,timelineEpoch:s.timelineEpoch,baseCheckpointVersion:s.checkpointRevision,firstSeq:s.acceptedSeq+1,lastSeq:s.acceptedSeq+inputs.length,fromTick:s.acceptedTick,toTick,ruleRef:this.config.ruleRef,mapRef:this.config.mapRef,inputs,digest:''};
  // roomNo is supplied by the loaded resource manifest and retained with configuration below.
  payload.roomNo=this.roomNo;
  payload.digest=await manifestDigest({payload:Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='digest')),config:this.config});
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
   this.pending=null;this.save();
  }catch(e){if(generation!==this.generation)return;this.current.status='unknown';this.current.code=e instanceof Error?e.message:'NETWORK_ERROR';this.current.predictionEnabled=false;}
 }
 async reconcileRejected(){if(!this.pending||!this.knownRejected||this.current.status!=='error')throw Error('ORIGINAL_RESULT_REQUIRED');const generation=this.generation;try{await this.refresh(generation);if(generation!==this.generation)return;this.pending=null;this.knownRejected=false;this.queue=[];this.save();}catch(e){if(generation!==this.generation)return;this.current.status='error';this.current.predictionEnabled=false;this.current.code=e instanceof Error?e.message:'RECONCILE_FAILED';}}

}
