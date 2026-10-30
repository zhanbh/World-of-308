import {parseChallengeRequest,parseChallengeResponse,parseDropList} from '../../../../shared/src/protocol/scene-v2.ts';
import {parseAssetQueryResponse} from '../../../../shared/src/protocol/asset-v2.ts';
type Collect=Extract<ReturnType<typeof parseChallengeRequest>,{command:'drop.collect'}>;
type DropView=Extract<ReturnType<typeof parseDropList>,{data:unknown}>;
export type DropIdentity={protocolVersion:2;sessionId:string;sessionEpoch:number;challengeId:string;sceneEpoch:number};
export interface DropPendingStore{load(key:string):string|null;save(key:string,value:string|null):void;}
/** Persistence stores only the original bounded public command. No local optimistic asset minting. */
export class DropCoordinator{
 private frozen=false;private identity:DropIdentity|null=null;private pending:Collect|null=null;private generation=0;private sequence=0;
 private current:{status:'closed'|'loading'|'ready'|'submitting'|'unknown'|'failed';view:DropView|null;code:string|null}={status:'closed',view:null,code:null};
 private transport:{send(text:string):Promise<string>};private persistence:DropPendingStore;
 constructor(transport:{send(text:string):Promise<string>},persistence:DropPendingStore){this.transport=transport;this.persistence=persistence;}
 get state(){return structuredClone(this.current);}
 private key(){const i=this.identity!;return JSON.stringify(['drop',i.sessionId,i.sessionEpoch,i.challengeId]);}
 close(){this.generation++;this.current.status='closed';}
 async open(identity:DropIdentity){this.frozen=false;this.identity={...identity};const generation=++this.generation;this.pending=null;this.current={status:'loading',view:null,code:null};
 const saved=this.persistence.load(this.key());if(saved!==null){const q=parseChallengeRequest(JSON.parse(saved));if(q.command!=='drop.collect'||q.sessionId!==identity.sessionId||q.sessionEpoch!==identity.sessionEpoch||q.payload.challengeId!==identity.challengeId)throw Error('INVALID_PENDING_DROP');this.pending=q;}
 await this.read(generation);if(generation===this.generation&&this.pending)this.current.status='unknown';
 }
 private async read(generation:number){const i=this.identity!;try{const raw=JSON.parse(await this.transport.send(JSON.stringify({protocolVersion:2,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,query:'drop.list',requestId:`drop-q-${++this.sequence}`,payload:{challengeId:i.challengeId,sceneEpoch:i.sceneEpoch}}))),r=parseDropList(raw);if(generation!==this.generation)return;
 if('error'in r){this.current.status='failed';this.current.code=r.error.code;return;}if(r.data.challengeId!==i.challengeId||r.data.sceneEpoch!==i.sceneEpoch)throw Error('VIEW_MISMATCH');this.current={status:'ready',view:r,code:null};
 }catch{if(generation===this.generation){this.current.status='failed';this.current.code='SERVICE_UNAVAILABLE';}}}
 async refresh(){if(!this.identity||this.pending||this.current.status==='submitting'||this.current.status==='loading')return;await this.read(this.generation);}
 async collect(operationId:string,dropId:string){if(this.frozen||!this.identity||this.pending||this.current.status!=='ready'||!this.current.view)throw Error('DROP_NOT_READY');const view=this.current.view,d=view.data.drops.find(d=>d.dropId===dropId&&!d.collected);if(!d)throw Error('DROP_NOT_AVAILABLE');const i=this.identity;
 this.pending=parseChallengeRequest({protocolVersion:2,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,command:'drop.collect',operationId,expected:view.versions,payload:{challengeId:i.challengeId,roomNo:view.data.roomNo,sceneEpoch:i.sceneEpoch,roomToken:view.data.roomToken,dropId,positionHint:{x:d.x,y:d.y}}}) as Collect;
 this.persistence.save(this.key(),JSON.stringify(this.pending));await this.sendPending(this.generation);
 }
 private async finish(value:unknown,generation:number){const q=this.pending!,r=parseChallengeResponse(value);if(r.command!=='drop.collect'||r.operationId!==q.operationId)throw Error('RESULT_MISMATCH');if(generation!==this.generation)return;
 if(r.outcome.status==='unknown'){this.current.status='unknown';return;}
 this.persistence.save(this.key(),null);this.pending=null;const code=r.outcome.status==='rejected'?r.outcome.code:null;await this.read(generation);if(generation===this.generation)this.current.code=code;
 }
 private async sendPending(generation:number){this.current.status='submitting';try{await this.finish(JSON.parse(await this.transport.send(JSON.stringify(this.pending))),generation);}catch{if(generation===this.generation)this.current.status='unknown';}}
 async refreshAfterRecovery(){this.frozen=false;await this.read(this.generation);}
 get hasPending(){return this.pending!==null;}
 freeze(){this.frozen=true;++this.generation;if(this.pending)this.current.status='unknown';}
 async resolvePendingOriginal(fenced=false):Promise<'settled'|'notFound'|'unknown'>{
  if(!this.pending)return 'settled';const generation=this.generation,q=this.pending,i=this.identity!;
  try{const r=parseAssetQueryResponse('operation.get',JSON.parse(await this.transport.send(JSON.stringify({protocolVersion:2,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,query:'operation.get',requestId:`drop-barrier-${++this.sequence}`,payload:{operationId:q.operationId}}))));if(generation!==this.generation)return 'unknown';if('error'in r)throw Error(r.error.code);
   if(r.data.status==='notFound'&&!fenced){this.current.status='unknown';return 'notFound';}
   const result=parseChallengeResponse(r.data.status==='found'?r.data.result:JSON.parse(await this.transport.send(JSON.stringify(q))));if(generation!==this.generation)return 'unknown';if(result.command!==q.command||result.operationId!==q.operationId)throw Error('RESULT_MISMATCH');if(result.outcome.status==='unknown')return 'unknown';this.persistence.save(this.key(),null);this.pending=null;this.current.code=result.outcome.status==='rejected'?result.outcome.code:null;return 'settled';
  }catch{if(generation===this.generation)this.current.status='unknown';return 'unknown';}
 }
 async retry(){if(this.frozen)throw Error('RECOVERY_BARRIER');if(!this.identity||!this.pending||this.current.status!=='unknown')throw Error('NO_UNKNOWN_DROP');const generation=this.generation,i=this.identity;this.current.status='submitting';
 try{const requestId=`drop-original-${++this.sequence}`,r=parseAssetQueryResponse('operation.get',JSON.parse(await this.transport.send(JSON.stringify({protocolVersion:2,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,query:'operation.get',requestId,payload:{operationId:this.pending.operationId}}))));if(generation!==this.generation)return;
 if('error'in r){this.current.status='unknown';this.current.code=r.error.code;return;}if(r.data.status==='notFound'){await this.sendPending(generation);return;}await this.finish(r.data.result,generation);
 }catch{if(generation===this.generation)this.current.status='unknown';}
 }
}
