import {encodeSceneMessage,decodeSceneReply} from '../../../../shared/src/protocol/scene-wire.ts';
import {parseRoomRequest,parseRoomResponse,parseRoomManifest} from '../../../../shared/src/protocol/scene-v2.ts';
import type {RoomManifest} from '../../../../shared/src/protocol/scene-v2.ts';
import {manifestDigest,resourceDigest} from '../../../../shared/src/room-manifest.ts';
import type {ActivationCoordinator} from './ActivationCoordinator.ts';
import type {EntryTransport,EntryPendingStore} from './ChallengeEntryCoordinator.ts';
type Prepare=Extract<ReturnType<typeof parseRoomRequest>,{command:'challenge.prepareRoom'}>;
export interface RoomResourceLoader {load(ref:string,releaseRef:string):Promise<Uint8Array>;}
export interface LoadingState {status:'idle'|'preparing'|'loading'|'loaded'|'unknown'|'failed'|'cancelled';manifest:RoomManifest|null;code:string|null;operationId:string|null;}
/** Retains the original command across resource errors/cancellation/reopen. No activation or prediction. */
export class LoadingCoordinator {
 private generation=0;
 private pending:Prepare|null=null;
 private transport:EntryTransport;private persistence:EntryPendingStore;private loader:RoomResourceLoader;
 private current:LoadingState={status:'idle',manifest:null,code:null,operationId:null};
 constructor(transport:EntryTransport,persistence:EntryPendingStore,loader:RoomResourceLoader){this.transport=transport;this.persistence=persistence;this.loader=loader;}
 get state():LoadingState{return structuredClone(this.current);}
 private key(c:Prepare){return JSON.stringify(['room-loading',c.sessionId,c.sessionEpoch,c.payload.characterId,c.payload.rolePlayEpoch,c.payload.challengeId]);}
 restore(context:unknown):void {
  const c=parseRoomRequest(context);if(c.command!=='challenge.prepareRoom')throw new Error('INVALID_LOADING_INTENT');
  ++this.generation;this.pending=null;this.current={status:'idle',manifest:null,code:null,operationId:null};
  const saved=this.persistence.load(this.key(c));if(saved===null)return;
  const original=parseRoomRequest(JSON.parse(saved));if(original.command!=='challenge.prepareRoom'||this.key(original)!==this.key(c))throw new Error('INVALID_LOADING_INTENT');
  this.pending=original;this.current={status:'unknown',manifest:null,code:null,operationId:original.operationId};
 }
 async prepare(value:unknown):Promise<void> {
  const c=parseRoomRequest(value);if(c.command!=='challenge.prepareRoom')throw new Error('INVALID_LOADING_INTENT');
  if(this.pending)throw new Error('PENDING_ROOM_PREPARATION');
  const saved=this.persistence.load(this.key(c));if(saved!==null)throw new Error('PENDING_ROOM_PREPARATION');
  this.persistence.save(this.key(c),encodeSceneMessage(c));this.pending=c;await this.submit();
 }
 /** Begin only the immediate successor after the previous room completed its verified handshake. */
 async prepareNextRoom(value:unknown,activation:ActivationCoordinator):Promise<void>{
  const c=parseRoomRequest(value);if(c.command!=='challenge.prepareRoom')throw new Error('INVALID_LOADING_INTENT');
  const old=this.pending,m=this.current.manifest;
  if(!old||this.current.status!=='loaded'||!m||this.key(c)!==this.key(old)||c.payload.nextRoomNo!==m.roomNo+1||c.operationId===old.operationId)throw new Error('INVALID_NEXT_ROOM');
  activation.retireCompletedRoom(m);
  ++this.generation;
  this.persistence.save(this.key(c),encodeSceneMessage(c));this.pending=c;
  this.current={status:'idle',manifest:null,code:null,operationId:c.operationId};
  await this.submit();
 }
 cancel():void {++this.generation;this.current.status='cancelled';}
 async retry():Promise<void>{if(!this.pending||this.current.status==='preparing'||this.current.status==='loading')throw new Error('NO_RETRYABLE_PREPARATION');await this.submit();}
 private async submit():Promise<void>{
  const c=this.pending!,generation=++this.generation;this.current={status:'preparing',manifest:this.current.manifest,code:null,operationId:c.operationId};
  let manifest:RoomManifest;
  try {
   const text=await this.transport.send(encodeSceneMessage(c));decodeSceneReply(c,text);const r=parseRoomResponse(JSON.parse(text));
   if(generation!==this.generation)return;
   if(r.outcome.status!=='committed'){this.current.status=r.outcome.status==='unknown'?'unknown':'failed';this.current.code=r.outcome.code;return;}
   if(r.command!=='challenge.prepareRoom')throw new Error('RESPONSE_MISMATCH');
   manifest=parseRoomManifest(r.outcome.data);
   if(manifest.challengeId!==c.payload.challengeId||manifest.roomNo!==c.payload.nextRoomNo)throw new Error('RESPONSE_MISMATCH');
   const {manifestHash,...body}=manifest;
   if(await manifestDigest(body)!==manifestHash)throw new Error('MANIFEST_HASH_MISMATCH');
   if(generation!==this.generation)return;
  }catch(e){if(generation===this.generation){this.current.status='unknown';this.current.code=e instanceof Error&&e.message==='MANIFEST_HASH_MISMATCH'?e.message:'RESULT_UNKNOWN';}return;}
  this.current.manifest=manifest;this.current.status='loading';
  try {
   for(const resource of manifest.resources){
    const bytes=await this.loader.load(resource.ref,manifest.releaseRef);
    if(generation!==this.generation)return;
    if(!(bytes instanceof Uint8Array)||bytes.length!==resource.byteLength||await resourceDigest(bytes)!==resource.sha256)throw new Error('RESOURCE_HASH_MISMATCH');
    if(generation!==this.generation)return;
   }
   this.current.status='loaded';
  }catch(e){if(generation===this.generation){this.current.status='failed';this.current.code=e instanceof Error&&e.message==='RESOURCE_HASH_MISMATCH'?e.message:'RESOURCE_MISSING';}}
 }
}
