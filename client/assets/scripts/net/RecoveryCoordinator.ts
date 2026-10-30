import {parseSceneRequest,parseSceneResponse,assembleRecoveryPages} from '../../../../shared/src/protocol/scene-v2.ts';
import {encodeSceneMessage,decodeSceneReply} from '../../../../shared/src/protocol/scene-wire.ts';
import {fetchRecoveryProof,sameProofState} from './RecoveryProof.ts';
import {verifyRecoveryPages} from '../../../../shared/src/public-state-proof.ts';
import type {EntryTransport,EntryPendingStore,EntryIdentity} from './ChallengeEntryCoordinator.ts';
import type {LoadingCoordinator} from './LoadingCoordinator.ts';
type Control=ReturnType<typeof parseSceneRequest>;
type Data=Extract<ReturnType<typeof parseSceneResponse>['outcome'],{status:'committed'}>['data'];
export interface RecoveryTransport extends EntryTransport {queryOriginalControl(text:string):Promise<string>;}
export interface RecoveryState {status:'idle'|'submitting'|'unknown'|'failed'|'recovering'|'loading'|'active';code:string|null;predictionEnabled:boolean;publicRecords:ReturnType<typeof assembleRecoveryPages>['records']|null;data:Data|null;}
type Journal={pending:Control|null;data:Data|null;pages:unknown[]|null};
/** Exact control intents survive reopen. Receipts are evidence of the past, never authority to predict the current scene. */
export class RecoveryCoordinator {
 private identity:(EntryIdentity&{challengeId:string})|null=null;private journal:Journal={pending:null,data:null,pages:null};private generation=0;private knownRejected=false;private loaded=false;private verifiedTicket:string|null=null;
 private current:RecoveryState={status:'idle',code:null,predictionEnabled:false,publicRecords:null,data:null};
 private transport:RecoveryTransport;private persistence:EntryPendingStore;
 constructor(transport:RecoveryTransport,persistence:EntryPendingStore){this.transport=transport;this.persistence=persistence;}
 get pendingCommand(){return this.journal.pending?.command??null;}
 get state():RecoveryState{return structuredClone(this.current);}
 private key(){const i=this.identity!;return JSON.stringify(['scene-recovery',i.sessionId,i.sessionEpoch,i.characterId,i.rolePlayEpoch,i.challengeId]);}
 private matches(c:Control){const i=this.identity!;return c.sessionId===i.sessionId&&c.sessionEpoch===i.sessionEpoch&&c.payload.characterId===i.characterId&&c.payload.rolePlayEpoch===i.rolePlayEpoch&&c.payload.challengeId===i.challengeId;}
 private save(){this.persistence.save(this.key(),JSON.stringify(this.journal));}
 init(identity:EntryIdentity&{challengeId:string}):void {
  ++this.generation;this.knownRejected=false;this.identity={...identity};this.loaded=false;this.verifiedTicket=null;this.journal={pending:null,data:null,pages:null};this.current={status:'idle',code:null,predictionEnabled:false,publicRecords:null,data:null};
  const saved=this.persistence.load(this.key());if(saved===null)return;const j=JSON.parse(saved);
  if(j.pending){j.pending=parseSceneRequest(j.pending);if(!this.matches(j.pending))throw Error('RECOVERY_CONTEXT_MISMATCH');}
  // Read models and proofs must be acquired afresh after reopening.
  const data=j.data?parseSceneResponse({protocolVersion:2,command:'scene.status',controlSeq:1,leaseRevision:0,serverTime:0,replayed:false,outcome:{status:'committed',data:j.data}}).outcome:null;
  if(data?.status==='committed'&&data.data.state.challengeId!==identity.challengeId)throw Error('RECOVERY_CONTEXT_MISMATCH');
  this.journal={pending:j.pending??null,data:data?.status==='committed'?data.data:null,pages:j.pages??null};this.current.status=j.pending?'unknown':'idle';
 }
 close():void{++this.generation;this.loaded=false;this.verifiedTicket=null;this.current.predictionEnabled=false;this.current.publicRecords=null;this.current.status='idle';}
 async control(value:unknown):Promise<void>{
  const c=parseSceneRequest(value);if(!this.identity||!this.matches(c))throw Error('RECOVERY_CONTEXT_MISMATCH');if(this.journal.pending)throw Error('PENDING_RECOVERY_CONTROL');
  if(c.command==='scene.ready'){
   const t=this.journal.data?.readyTicket;if(!t||!this.loaded||(!('kind' in t)&&this.verifiedTicket!==t.readyTicketId))throw Error('SCENE_NOT_VERIFIED');
   for(const [k,v] of Object.entries(t))if(k!=='deadline'&&c.payload[k as keyof typeof c.payload]!==v)throw Error('READY_CONTEXT_MISMATCH');
  }
  this.knownRejected=false;this.journal.pending=c;this.save();await this.submit(false);
 }
 async retry():Promise<void>{if(!this.journal.pending||this.current.status==='submitting')throw Error('NO_PENDING_RECOVERY_CONTROL');await this.submit(true);}
 /** Only an actual original command rejection permits retirement; a query notFound placeholder does not. */
 async reconcileRejected():Promise<void>{
  const c=this.journal.pending;if(!c||!this.knownRejected||this.current.status!=='failed')throw Error('ORIGINAL_RESULT_REQUIRED');const generation=this.generation;
  const q={protocolVersion:2,command:'scene.status',sessionId:c.sessionId,sessionEpoch:c.sessionEpoch,controlSeq:c.command==='heartbeat'?1:c.controlSeq,leaseRevision:c.leaseRevision,payload:{characterId:c.payload.characterId,rolePlayEpoch:c.payload.rolePlayEpoch,challengeId:c.payload.challengeId,readyTicketId:null}};
  const text=await this.transport.send(encodeSceneMessage(q));if(generation!==this.generation)return;decodeSceneReply(q,text);const r=parseSceneResponse(JSON.parse(text));if(r.outcome.status!=='committed')throw Error(r.outcome.code);
  this.journal={pending:null,data:r.outcome.data,pages:null};this.knownRejected=false;this.loaded=false;this.verifiedTicket=null;this.save();this.current={status:r.outcome.data.state.connection==='recovery'?'recovering':'loading',code:null,predictionEnabled:false,publicRecords:null,data:r.outcome.data};
 }
 useLoadedResources(loading:LoadingCoordinator):void{
  const manifest=loading.state.manifest,t=this.journal.data?.readyTicket;
  if(loading.state.status!=='loaded'||!manifest||!t||manifest.challengeId!==this.identity?.challengeId||manifest.manifestHash!==t.manifestHash||('kind' in t&&manifest.roomAttemptId!==t.roomAttemptId))throw Error('RESOURCES_NOT_LOADED');this.loaded=true;
 }
 async fetchPages(prefix:string):Promise<void>{
  const generation=this.generation,t=this.journal.data?.readyTicket,i=this.identity;if(!t||!i||'kind' in t)throw Error('NO_CHECKPOINT_TICKET');this.current.predictionEnabled=false;this.current.publicRecords=null;this.verifiedTicket=null;
  const pages=this.journal.pending?.command==='scene.ready'&&this.journal.pages?structuredClone(this.journal.pages):await fetchRecoveryProof(this.transport,i,t,prefix,()=>generation===this.generation);
  if(!pages)return;const proof=await verifyRecoveryPages(pages);if(generation!==this.generation)return;
  for(const [k,v] of Object.entries(t))if(proof[k as keyof typeof proof]!==v)throw Error('TICKET_PROOF_MISMATCH');if(this.journal.data?.readyTicket?.readyTicketId!==t.readyTicketId)throw Error('TICKET_PROOF_MISMATCH');this.verifiedTicket=t.readyTicketId;this.journal.pages=structuredClone(pages);this.save();
 }
 private async submit(recover:boolean):Promise<void>{
  const generation=++this.generation,c=this.journal.pending!;this.current.status='submitting';this.current.code=null;this.current.predictionEnabled=false;this.current.publicRecords=null;
  try{
   let text:string|undefined;if(recover){
    if(c.command==='scene.ready'){
     const q={...c,command:'scene.status',payload:{characterId:c.payload.characterId,rolePlayEpoch:c.payload.rolePlayEpoch,challengeId:c.payload.challengeId,readyTicketId:c.payload.readyTicketId}};text=await this.transport.send(encodeSceneMessage(q));
    }else text=await this.transport.queryOriginalControl(encodeSceneMessage(c));
    if(generation!==this.generation)return;const original=parseSceneResponse(JSON.parse(text));if(original.outcome.status==='rejected'&&original.outcome.code==='VERSION_CONFLICT')text=undefined;
   }
   if(text===undefined&&c.command==='scene.ready'){const t=this.journal.data?.readyTicket;if(!t||!this.loaded||(!('kind' in t)&&this.verifiedTicket!==t.readyTicketId))throw Error('SCENE_NOT_VERIFIED');}
   text??=await this.transport.send(encodeSceneMessage(c));if(generation!==this.generation)return;decodeSceneReply(c,text);const r=parseSceneResponse(JSON.parse(text));
   if(r.outcome.status!=='committed'){this.knownRejected=r.outcome.status==='rejected';this.current.status=r.outcome.status==='unknown'?'unknown':'failed';this.current.code=r.outcome.code;return;}
   const original=r.outcome.data;let data=original;
   // A successful original ready can predate another disconnect, takeover, or newer timeline.
   if(c.command==='scene.ready'){
    const q={protocolVersion:2,command:'scene.status',sessionId:c.sessionId,sessionEpoch:c.sessionEpoch,controlSeq:c.controlSeq,leaseRevision:r.leaseRevision,payload:{characterId:c.payload.characterId,rolePlayEpoch:c.payload.rolePlayEpoch,challengeId:c.payload.challengeId,readyTicketId:null}};
    const latestText=await this.transport.send(encodeSceneMessage(q));if(generation!==this.generation)return;decodeSceneReply(q,latestText);const latest=parseSceneResponse(JSON.parse(latestText));if(latest.outcome.status!=='committed')throw Error('CURRENT_SCENE_NOT_VERIFIED');data=latest.outcome.data;
    if(data.state.sceneEpoch!==original.state.sceneEpoch||data.state.timelineEpoch!==original.state.timelineEpoch||data.state.connection!=='connected')throw Error('CURRENT_SCENE_NOT_VERIFIED');
    if(!('kind' in data.state)&&!('kind' in original.state)&&(data.state.manifestHash!==original.state.manifestHash||data.state.checkpointRevision<original.state.checkpointRevision))throw Error('CURRENT_SCENE_NOT_VERIFIED');
    if(!('kind' in original.state)&&(data.state.roomPhase==='active'||data.state.roomPhase==='cleared'&&data.state.result==='completed')){
     const live=data.state,t=this.journal.data?.readyTicket;
     if('kind' in live||!t||'kind' in t||!sameProofState(live,live))throw Error('CURRENT_SCENE_NOT_VERIFIED');
     const pages=await fetchRecoveryProof(this.transport,{...c,...c.payload},{readyTicketId:c.payload.readyTicketId!,sceneEpoch:live.sceneEpoch,timelineEpoch:live.timelineEpoch,checkpointRevision:live.checkpointRevision,publicStateHash:live.publicStateHash,manifestHash:live.manifestHash},`active-${c.controlSeq}`,()=>generation===this.generation);
     if(!pages||generation!==this.generation)return;
     const finalText=await this.transport.send(encodeSceneMessage(q));if(generation!==this.generation)return;decodeSceneReply(q,finalText);const final=parseSceneResponse(JSON.parse(finalText));
     if(final.outcome.status!=='committed'||'kind' in final.outcome.data.state||!sameProofState(live,final.outcome.data.state))throw Error('CURRENT_SCENE_NOT_VERIFIED');
     data=final.outcome.data;this.current.publicRecords=assembleRecoveryPages(pages).records;
    }
   }
   const previousTicket=this.journal.data?.readyTicket;this.journal={pending:null,data,pages:null};this.save();this.current.data=data;
   if(previousTicket?.readyTicketId!==data.readyTicket?.readyTicketId)this.verifiedTicket=null;
   const s=data.state;this.current.predictionEnabled=!!(c.command==='scene.ready'&&this.loaded&&this.current.publicRecords&&previousTicket&&!('kind' in previousTicket)&&!('kind' in s)&&sameProofState(s,s));
   this.current.status=this.current.predictionEnabled?'active':s.connection==='recovery'?'recovering':'loading';
  }catch{if(generation!==this.generation)return;this.current.status='unknown';this.current.code='RESULT_UNKNOWN';}
 }
}
