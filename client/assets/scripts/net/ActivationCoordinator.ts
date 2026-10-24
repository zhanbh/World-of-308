import {encodeAssetRequest,decodeAssetResponse} from '../../../../shared/src/protocol/asset-v2.ts';
import {parseRoomRequest,parseRoomResponse,parseSceneRequest,parseSceneResponse,assembleRecoveryPages,parseChallengeQueryResponse} from '../../../../shared/src/protocol/scene-v2.ts';
import type {RoomManifest,SceneState} from '../../../../shared/src/protocol/scene-v2.ts';
import {encodeSceneMessage,decodeSceneReply} from '../../../../shared/src/protocol/scene-wire.ts';
import {fetchRecoveryProof,sameProofState} from './RecoveryProof.ts';
import {verifyRecoveryPages} from '../../../../shared/src/public-state-proof.ts';
import type {EntryTransport,EntryPendingStore} from './ChallengeEntryCoordinator.ts';
import type {LoadingCoordinator} from './LoadingCoordinator.ts';
type Activate=Extract<ReturnType<typeof parseRoomRequest>,{command:'challenge.activateRoom'}>;
type Ready=Extract<ReturnType<typeof parseSceneRequest>,{command:'scene.ready'}>;
type Ticket=NonNullable<Extract<ReturnType<typeof parseRoomResponse>['outcome'],{status:'committed'}>['data'] extends infer D? D extends {readyTicket:infer T}?T:never:never>;
type Journal={activation:Activate;ticket:Ticket|null;ready:Ready|null;committed:SceneState|null;pages:unknown[]|null};
export interface ActivationState{status:'idle'|'submitting'|'unknown'|'awaitingProof'|'active'|'failed';code:string|null;predictionEnabled:boolean;publicRecords:ReturnType<typeof assembleRecoveryPages>['records']|null;ticket:Ticket|null;state:SceneState|null;}
/** Durable intent journal. Reload always reacquires resources and the complete public proof. */
export class ActivationCoordinator{
 private journal:Journal|null=null;private loaded=false;private verified=false;private confirmedReady=false;private generation=0;
 private current:ActivationState={status:'idle',code:null,predictionEnabled:false,publicRecords:null,ticket:null,state:null};
 private transport:EntryTransport;private persistence:EntryPendingStore;
 constructor(transport:EntryTransport,persistence:EntryPendingStore){this.transport=transport;this.persistence=persistence;}
 get state():ActivationState{return structuredClone(this.current);}
 private parse(value:unknown):Activate{const c=parseRoomRequest(value);if(c.command!=='challenge.activateRoom')throw Error('INVALID_ACTIVATION');return c;}
 private key(c:Activate){return JSON.stringify(['room-activation',c.sessionId,c.sessionEpoch,c.payload.characterId,c.payload.rolePlayEpoch,c.payload.challengeId]);}
 private save(){this.persistence.save(this.key(this.journal!.activation),JSON.stringify(this.journal));}
 restore(context:unknown):void{
  ++this.generation;this.confirmedReady=false;const c=this.parse(context);this.loaded=false;this.verified=false;this.journal=null;this.current={status:'idle',code:null,predictionEnabled:false,publicRecords:null,ticket:null,state:null};
  const saved=this.persistence.load(this.key(c));if(saved===null)return;
  const j=JSON.parse(saved);const original=this.parse(j.activation);if(this.key(original)!==this.key(c))throw Error('INVALID_ACTIVATION');
  if(j.ready){const ready=parseSceneRequest(j.ready);if(ready.command!=='scene.ready')throw Error('INVALID_READY');j.ready=ready;}
  this.journal={...j,activation:original};this.current.status='unknown';this.current.ticket=j.ticket;this.current.state=j.committed;
 }
 useLoadedResources(loading:LoadingCoordinator):void{
  const j=this.journal;if(!j)throw Error('NO_ACTIVATION');const s=loading.state,p=j.activation.payload;
  if(s.status!=='loaded'||!s.manifest||s.manifest.roomAttemptId!==p.roomAttemptId||s.manifest.challengeId!==p.challengeId||s.manifest.manifestHash!==p.manifestHash)throw Error('RESOURCES_NOT_LOADED');
  this.loaded=true;this.enable();
 }
 async activate(value:unknown,loading:LoadingCoordinator):Promise<void>{
  const c=this.parse(value);if(this.journal||this.persistence.load(this.key(c))!==null)throw Error('PENDING_ACTIVATION');
  ++this.generation;this.confirmedReady=false;this.journal={activation:c,ticket:null,ready:null,committed:null,pages:null};
  try{this.useLoadedResources(loading);}catch(e){this.journal=null;throw e;}
  this.save();await this.retry();
 }
 /** Retire original receipts before a successor room can issue any asynchronous work. */
 retireCompletedRoom(manifest:RoomManifest):void{
  const j=this.journal;
  if(!j||this.current.status!=='active'||!this.current.predictionEnabled||!j.committed||j.activation.payload.roomAttemptId!==manifest.roomAttemptId||j.activation.payload.challengeId!==manifest.challengeId||j.activation.payload.manifestHash!==manifest.manifestHash)throw Error('PREVIOUS_ROOM_NOT_ACTIVE');
  ++this.generation;this.confirmedReady=false;this.loaded=false;this.verified=false;
  this.persistence.save(this.key(j.activation),null);this.journal=null;
  this.current={status:'idle',code:null,predictionEnabled:false,publicRecords:null,ticket:null,state:null};
 }
 async verifyPages(values:unknown[]):Promise<void>{
  const generation=this.generation,j=this.journal;this.confirmedReady=false;this.verified=false;this.current.predictionEnabled=false;this.current.publicRecords=null;
  const proof=await verifyRecoveryPages(values);if(generation!==this.generation)return;const ticket=j?.ticket;if(!ticket)throw Error('NO_READY_TICKET');
  for(const key of ['readyTicketId','sceneEpoch','timelineEpoch','checkpointRevision','publicStateHash','manifestHash','deadline'] as const)if(proof[key]!==ticket[key])throw Error('TICKET_PROOF_MISMATCH');
  this.journal!.pages=structuredClone(values);this.save();this.verified=true;this.enable();
 }
 async fetchPages(requestIdPrefix:string):Promise<void>{
  const generation=this.generation,j=this.journal,t=j?.ticket;if(!j||!t)throw Error('NO_READY_TICKET');
  if(j.ready&&j.pages){await this.verifyPages(j.pages);return;}
  const c=j.activation,pages=await fetchRecoveryProof(this.transport,{...c,...c.payload},t,requestIdPrefix,()=>generation===this.generation);
  if(pages)await this.verifyPages(pages);
 }
 async ready(value:unknown):Promise<void>{
  if(!this.loaded||!this.verified||!this.journal?.ticket)throw Error('SCENE_NOT_VERIFIED');
  const c=parseSceneRequest(value);if(c.command!=='scene.ready'||'kind' in c.payload)throw Error('INVALID_READY');const j=this.journal,a=j.activation,t=j.ticket!;
  if(j.ready)throw Error('PENDING_READY');
  if(c.sessionId!==a.sessionId||c.sessionEpoch!==a.sessionEpoch||c.payload.characterId!==a.payload.characterId||c.payload.rolePlayEpoch!==a.payload.rolePlayEpoch||c.payload.challengeId!==a.payload.challengeId)throw Error('READY_CONTEXT_MISMATCH');
  for(const key of ['readyTicketId','sceneEpoch','timelineEpoch','checkpointRevision','publicStateHash','manifestHash'] as const)if(c.payload[key]!==t[key])throw Error('READY_CONTEXT_MISMATCH');
  j.ready=c;this.save();await this.retry();
 }
 async retry():Promise<void>{
  if(!this.journal||this.current.status==='submitting')throw Error('NO_PENDING_ACTIVATION');const generation=this.generation,j=this.journal,c=j.ready??j.activation;
  const recover=this.current.status==='unknown';this.confirmedReady=false;this.current.status='submitting';this.current.code=null;this.current.predictionEnabled=false;this.current.publicRecords=null;
  try{
   const original=recover?await this.queryOriginal(j):null;if(generation!==this.generation)return;
   const text=original??await this.transport.send(encodeSceneMessage(c));if(generation!==this.generation)return;decodeSceneReply(c,text);
   const r=c.command==='scene.ready'?parseSceneResponse(JSON.parse(text)):parseRoomResponse(JSON.parse(text));
   if(r.outcome.status!=='committed'){this.current.status=r.outcome.status==='unknown'?'unknown':'failed';this.current.code=r.outcome.code;return;}
   if(c.command==='scene.ready'){
    const data=r.outcome.data;if(!('state' in data)||'kind' in data.state||data.state.roomPhase!=='active'||data.state.connection!=='connected'||data.state.lifeState!=='alive'||data.state.result!=='active')throw Error('READY_NOT_ACTIVE');
    j.committed=data.state;this.current.state=data.state;this.confirmedReady=false;
    const q={protocolVersion:2,query:'challenge.get',requestId:`current-${j.activation.operationId}`.slice(0,64),sessionId:c.sessionId,sessionEpoch:c.sessionEpoch,payload:{challengeId:j.activation.payload.challengeId}};
    const currentText=await this.transport.send(encodeSceneMessage(q));if(generation!==this.generation)return;
    decodeSceneReply(q,currentText);const current=parseChallengeQueryResponse(JSON.parse(currentText));
    if('error' in current)throw Error(current.error.code);
    const live=current.data,original=data.state;
    if('kind' in live||live.roomPhase!=='active'||live.connection!=='connected'||live.lifeState!=='alive'||live.result!=='active'||live.sceneEpoch!==original.sceneEpoch||live.timelineEpoch!==original.timelineEpoch||live.checkpointRevision<original.checkpointRevision||live.manifestHash!==original.manifestHash)throw Error('CURRENT_SCENE_NOT_VERIFIED');
    const ticket=j.ticket;if(!ticket)throw Error('NO_READY_TICKET');
    const pages=await fetchRecoveryProof(this.transport,{...c,...c.payload},{readyTicketId:c.payload.readyTicketId,sceneEpoch:live.sceneEpoch,timelineEpoch:live.timelineEpoch,checkpointRevision:live.checkpointRevision,publicStateHash:live.publicStateHash,manifestHash:live.manifestHash},`active-${j.activation.operationId}`.slice(0,56),()=>generation===this.generation);
    if(!pages||generation!==this.generation)return;
    const finalText=await this.transport.send(encodeSceneMessage(q));if(generation!==this.generation)return;decodeSceneReply(q,finalText);const final=parseChallengeQueryResponse(JSON.parse(finalText));
    if('error' in final||'kind' in final.data||!sameProofState(live,final.data))throw Error('CURRENT_SCENE_NOT_VERIFIED');
    this.current.publicRecords=assembleRecoveryPages(pages).records;this.verified=true;this.confirmedReady=true;this.current.state=final.data;j.committed=final.data;
   }else{
    const data=r.outcome.data;if(!('readyTicket' in data)||!data.readyTicket||'kind' in data.readyTicket||'kind' in data.state||data.state.challengeId!==j.activation.payload.challengeId||data.readyTicket.manifestHash!==j.activation.payload.manifestHash)throw Error('RESPONSE_MISMATCH');
    j.ticket=data.readyTicket;this.current.ticket=data.readyTicket;this.current.state=data.state;
   }
   this.save();this.current.status='awaitingProof';this.enable();
  }catch{if(generation!==this.generation)return;this.current.status='unknown';this.current.code='RESULT_UNKNOWN';}
 }
 /** Query the durable original receipt before resubmitting an uncertain command. */
 private async queryOriginal(j:Journal):Promise<string|null>{
  const a=j.activation;
  if(j.ready){
   const r=j.ready,q={protocolVersion:2,command:'scene.status',sessionId:r.sessionId,sessionEpoch:r.sessionEpoch,controlSeq:r.controlSeq,leaseRevision:r.leaseRevision,payload:{characterId:r.payload.characterId,rolePlayEpoch:r.payload.rolePlayEpoch,challengeId:r.payload.challengeId,readyTicketId:r.payload.readyTicketId}};
   const text=await this.transport.send(encodeSceneMessage(q)),reply=parseSceneResponse(JSON.parse(text));
   if(reply.outcome.status==='rejected'&&reply.outcome.code==='VERSION_CONFLICT')return null;
   decodeSceneReply(r,text);return text;
  }
  const q={protocolVersion:2 as const,query:'operation.get' as const,requestId:`original-${a.operationId}`.slice(0,64),sessionId:a.sessionId,sessionEpoch:a.sessionEpoch,payload:{operationId:a.operationId}};
  const text=await this.transport.send(encodeAssetRequest(q));const r=decodeAssetResponse(q,text);
  if('error' in r)throw Error(r.error.code);
  if(!('data' in r))throw Error('INVALID_ORIGINAL_RESULT');
  const data=r.data as {status:string;result?:unknown};if(data.status==='notFound')return null;
  const result=JSON.stringify(data.result);decodeSceneReply(a,result);return result;
 }
 private enable(){this.current.predictionEnabled=!!(this.loaded&&this.verified&&this.confirmedReady&&this.current.publicRecords&&this.journal?.committed);if(this.current.predictionEnabled)this.current.status='active';}
}
