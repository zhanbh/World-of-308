import {parseChallengeRequest,parseChallengeResponse,parseChallengeQueryResponse,parseClearReceipt} from '../../../../shared/src/protocol/scene-v2.ts';
import type {ClearReceipt} from '../../../../shared/src/protocol/scene-v2.ts';
import {parseAssetQueryResponse} from '../../../../shared/src/protocol/asset-v2.ts';
import type {EntryPendingStore,EntryTransport} from './ChallengeEntryCoordinator.ts';
type Leave=Extract<ReturnType<typeof parseChallengeRequest>,{command:'challenge.leave'}>;
export type TerminalIdentity={protocolVersion:2;sessionId:string;sessionEpoch:number;challengeId:string};
export interface TerminalClientState {status:'loading'|'ready'|'submitting'|'unknown'|'closed'|'failed';receipt:ClearReceipt|null;code:string|null;fadeReady:boolean;}
/** A receipt is a service fact. Fade starts only after the original leave result is known. */
export class TerminalCoordinator {
 private identity:TerminalIdentity|null=null;
 private pending:Leave|null=null;
 private generation=0;
 private sequence=0;
 private current:TerminalClientState={status:'loading',receipt:null,code:null,fadeReady:false};
 private transport:EntryTransport;
 private persistence:EntryPendingStore;
 constructor(transport:EntryTransport,persistence:EntryPendingStore){this.transport=transport;this.persistence=persistence;}
 get state():TerminalClientState{return structuredClone(this.current);}
 private key(){const i=this.identity!;return JSON.stringify(['terminal-leave',i.sessionId,i.sessionEpoch,i.challengeId]);}
 async open(identity:TerminalIdentity){
  this.identity={...identity};const generation=++this.generation;this.pending=null;this.current={status:'loading',receipt:null,code:null,fadeReady:false};
  const saved=this.persistence.load(this.key());
  if(saved!==null){const q=parseChallengeRequest(JSON.parse(saved));if(q.command!=='challenge.leave'||q.payload.reason!=='finishLoot'||q.sessionId!==identity.sessionId||q.sessionEpoch!==identity.sessionEpoch||q.payload.challengeId!==identity.challengeId)throw Error('INVALID_PENDING_LEAVE');this.pending=q;}
  await this.read(generation);if(generation===this.generation&&this.pending){this.current.status='unknown';this.current.fadeReady=false;}
 }
 private async read(generation:number){
  const i=this.identity!;
  try{const r=parseChallengeQueryResponse(JSON.parse(await this.transport.send(JSON.stringify({protocolVersion:2,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,query:'challenge.get',requestId:`terminal-${++this.sequence}`,payload:{challengeId:i.challengeId}}))));
   if(generation!==this.generation)return null;
   if('error'in r)throw Error(r.error.code);
   if('kind'in r.data||r.data.challengeId!==i.challengeId)throw Error('VIEW_MISMATCH');
   this.current.receipt='clearReceipt'in r?parseClearReceipt(r.clearReceipt):null;this.current.code=null;
   this.current.status=r.data.connection==='closed'?'closed':'ready';
   // A restored unknown leave must recover its O even if challenge.get already says closed.
   this.current.fadeReady=r.data.connection==='closed'&&!this.pending;
   return r;
  }catch(e){if(generation===this.generation){this.current.status=this.pending?'unknown':'failed';this.current.code=e instanceof Error?e.message:'SERVICE_UNAVAILABLE';}return null;}
 }
 close(){++this.generation;this.current.status='closed';this.current.fadeReady=false;}
 async refresh(){if(!this.identity||this.pending||this.current.status==='submitting')return;await this.read(this.generation);}
 async leave(operationId:string,busy:{movement:boolean;drop:boolean}){
  if(!this.identity||this.pending||this.current.status!=='ready'||!this.current.receipt||this.current.receipt.sceneState!=='looting'||busy.movement||busy.drop)throw Error('LEAVE_NOT_READY');
  const generation=this.generation;this.current.status='submitting';
  const r=await this.read(generation);if(!r||generation!==this.generation)return;
  if(!('clearReceipt'in r)||parseClearReceipt(r.clearReceipt).sceneState!=='looting'||r.data.connection==='closed'){this.current.status='failed';this.current.code='SCENE_NOT_LOOTING';return;}
  const i=this.identity!;
  this.pending=parseChallengeRequest({protocolVersion:2,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,command:'challenge.leave',operationId,expected:r.versions,payload:{challengeId:i.challengeId,reason:'finishLoot'}}) as Leave;
  this.persistence.save(this.key(),JSON.stringify(this.pending));await this.send(generation);
 }
 private async finish(value:unknown,generation:number){
  const q=this.pending!,r=parseChallengeResponse(value);
  if(r.command!=='challenge.leave'||r.operationId!==q.operationId)throw Error('RESULT_MISMATCH');if(generation!==this.generation)return;
  if(r.outcome.status==='unknown'){this.current.status='unknown';return;}
  this.persistence.save(this.key(),null);this.pending=null;
  if(r.outcome.status==='committed'){this.current.status='closed';this.current.fadeReady=true;if(this.current.receipt)this.current.receipt.sceneState='closed';this.current.code=null;}
  else {await this.read(generation);if(generation===this.generation){this.current.code=r.outcome.code;this.current.fadeReady=false;}}
 }
 private async send(generation:number){this.current.status='submitting';try{await this.finish(JSON.parse(await this.transport.send(JSON.stringify(this.pending))),generation);}catch{if(generation===this.generation)this.current.status='unknown';}}
 async retry(){
  if(!this.identity||!this.pending||this.current.status!=='unknown')throw Error('NO_UNKNOWN_LEAVE');const i=this.identity,generation=this.generation;this.current.status='submitting';
  try{const r=parseAssetQueryResponse('operation.get',JSON.parse(await this.transport.send(JSON.stringify({protocolVersion:2,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,query:'operation.get',requestId:`leave-original-${++this.sequence}`,payload:{operationId:this.pending.operationId}}))));if(generation!==this.generation)return;
   if('error'in r)throw Error(r.error.code);if(r.data.status==='notFound')await this.send(generation);else await this.finish(r.data.result,generation);
  }catch{if(generation===this.generation)this.current.status='unknown';}
 }
}
