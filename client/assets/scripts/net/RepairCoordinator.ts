import {parseAssetCommand,encodeAssetRequest,decodeAssetResponse} from '../../../../shared/src/protocol/asset-v2.ts';
import type {AssetCommand,AssetQuery,AssetQueryResponse,AssetResponse} from '../../../../shared/src/protocol/asset-v2.ts';
import type {Expected} from '../../../../shared/src/protocol/session-v2.ts';
type Identity={sessionId:string;sessionEpoch:number;characterId:string;rolePlayEpoch:number};
type Command=Extract<AssetCommand,{command:'equipment.repair'}>;
type View=Extract<AssetQueryResponse<'repair.get'>,{data:unknown}>['data'];
type Quote=Extract<AssetQueryResponse<'service.quote'>,{data:unknown}>['data'];
interface Transport {send(text:string):Promise<string>;}
interface Persistence {load(key:string):string|null;save(key:string,value:string|null):void;}
export interface RepairState {status:'closed'|'loading'|'empty'|'ready'|'submitting'|'unknown'|'failed';contextId:string|null;itemId:string|null;view:View|null;quote:Quote|null;code:string|null;pendingOperationId:string|null;lastResult:{repairedItemIds:string[];chargedGold:string}|null;}
/** Owns one original intent. UI closure retires callbacks, never cancels the transaction. */
export class RepairCoordinator {
 private identity:Identity|null=null;private pending:Command|null=null;private generation=0;private sequence=0;private minimum:Expected[]=[];
 private current:RepairState=this.initial();
 private transport:Transport;private persistence:Persistence;private operationId:()=>string;
 constructor(transport:Transport,persistence:Persistence,operationId:()=>string=()=>`repair-${globalThis.crypto.randomUUID()}`){this.transport=transport;this.persistence=persistence;this.operationId=operationId;}
 private initial():RepairState{return{status:'closed',contextId:null,itemId:null,view:null,quote:null,code:null,pendingOperationId:null,lastResult:null};}
 get state(){return structuredClone(this.current);}
 private key(){const i=this.identity!;return JSON.stringify(['single-repair',i.sessionId,i.sessionEpoch,i.characterId,i.rolePlayEpoch]);}
 init(identity:Identity){++this.generation;this.identity={...identity};this.current=this.initial();this.minimum=[];this.pending=null;const saved=this.persistence.load(this.key());if(saved!==null){const q=parseAssetCommand(JSON.parse(saved));if(q.command!=='equipment.repair'||q.payload.target.kind!=='single'||q.sessionId!==identity.sessionId||q.sessionEpoch!==identity.sessionEpoch||q.payload.characterId!==identity.characterId)throw Error('INVALID_PENDING_REPAIR');this.pending=q;this.current.pendingOperationId=q.operationId;}}
 close(){++this.generation;this.current.status='closed';this.current.quote=null;}
 async open(contextId:string,itemId:string|null){if(!this.identity)throw Error('IDENTITY_REQUIRED');const g=++this.generation;this.current={...this.initial(),status:this.pending?'unknown':itemId?'loading':'empty',contextId,itemId,pendingOperationId:this.pending?.operationId??null};if(!this.pending&&itemId)await this.read(g);}
 async refresh(){if(!this.identity||this.current.status==='closed'||this.pending)throw Error('REPAIR_NOT_READY');const g=++this.generation;this.current.status=this.current.itemId?'loading':'empty';if(this.current.itemId)await this.read(g);}
 private async query<K extends AssetQuery['query']>(query:K,payload:Extract<AssetQuery,{query:K}>['payload']):Promise<AssetQueryResponse<K>>{
  const i=this.identity!,q={protocolVersion:2,query,requestId:`repair-view-${++this.sequence}`,sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,payload} as AssetQuery;
  return decodeAssetResponse(q,await this.transport.send(encodeAssetRequest(q))) as AssetQueryResponse<K>;
 }
 private async read(g:number){
  const i=this.identity!,contextId=this.current.contextId!,itemId=this.current.itemId!;
  try{
   const view=await this.query('repair.get',{characterId:i.characterId,contextId,itemId});if(g!==this.generation)return;if('error'in view)throw Error(view.error.code);
   if(view.data.characterId!==i.characterId||view.data.contextId!==contextId||view.data.item.itemId!==itemId)throw Error('VIEW_MISMATCH');
   if(this.minimum.some(e=>view.versions.some(v=>v.kind===e.kind&&v.id===e.id&&v.version<e.version)))throw Error('STALE_REPAIR_VIEW');
   const payload:Command['payload']={characterId:i.characterId,contextId,target:{kind:'single',itemId},quoteRef:'unquoted'};
   const quote=await this.query('service.quote',{characterId:i.characterId,contextId,serviceIntent:{command:'equipment.repair',payload}});if(g!==this.generation)return;if('error'in quote)throw Error(quote.error.code);
   const detail=quote.data.repair;
   if(quote.data.serviceKind!=='repair'||!detail||detail.expiresAt<=quote.serverTime||detail.items.length!==1||detail.items[0].itemId!==itemId||detail.items[0].current!==view.data.item.durability.current||detail.items[0].max!==view.data.item.durability.max||quote.data.targetVersions.length!==view.versions.length||quote.data.targetVersions.some(e=>!view.versions.some(v=>v.kind===e.kind&&v.id===e.id&&v.version===e.version)))throw Error('REPAIR_VIEW_CHANGED');
   this.current.view=view.data;this.current.quote=quote.data;this.current.status='ready';this.current.code=null;
  }catch(e){if(g===this.generation){this.current.quote=null;this.current.status='failed';this.current.code=e instanceof Error?e.message:'SERVICE_UNAVAILABLE';}}
 }
 async repair(){
  if(!this.identity||this.pending||this.current.status!=='ready'||!this.current.quote||!this.current.itemId||!this.current.contextId)throw Error('REPAIR_NOT_READY');
  const i=this.identity,q=parseAssetCommand({protocolVersion:2,command:'equipment.repair',operationId:this.operationId(),sessionId:i.sessionId,sessionEpoch:i.sessionEpoch,expected:this.current.quote.targetVersions,payload:{characterId:i.characterId,contextId:this.current.contextId,target:{kind:'single',itemId:this.current.itemId},quoteRef:this.current.quote.quoteRef}}) as Command;
  this.persistence.save(this.key(),encodeAssetRequest(q));this.pending=q;this.current.pendingOperationId=q.operationId;await this.send(q,this.generation);
 }
 private unknown(){this.current.status='unknown';this.current.code='RESULT_UNKNOWN';}
 private async send(q:Command,g:number){this.current.status='submitting';this.current.code=null;try{const response=decodeAssetResponse(q,await this.transport.send(encodeAssetRequest(q))) as AssetResponse<'equipment.repair'>;if(g===this.generation&&this.pending===q)await this.accept(response,q,g);}catch{if(g===this.generation&&this.pending===q)this.unknown();}}
 private async accept(r:AssetResponse<'equipment.repair'>,q:Command,g:number){
  if(r.operationId!==q.operationId)throw Error('RESULT_MISMATCH');if(r.outcome.status==='unknown'){this.unknown();return;}
  this.persistence.save(this.key(),null);this.pending=null;this.current.pendingOperationId=null;this.current.quote=null;
  if(r.outcome.status==='rejected'){this.current.status='failed';this.current.code=r.outcome.code;return;}
  this.minimum=r.outcome.resultVersions;this.current.lastResult=r.outcome.data;this.current.status='loading';if(this.current.itemId)await this.read(g);else this.current.status='empty';
 }
 async recover(){
  if(!this.identity||!this.pending||this.current.status!=='unknown')throw Error('NO_UNKNOWN_REPAIR');const q=this.pending,g=this.generation;this.current.status='submitting';this.current.code=null;
  try{const r=await this.query('operation.get',{operationId:q.operationId});if(g!==this.generation||this.pending!==q)return;if('error'in r)throw Error(r.error.code);
   if(r.data.status==='notFound'){await this.send(q,g);return;}
   if(r.data.command!==q.command)throw Error('RESULT_MISMATCH');await this.accept(r.data.result as AssetResponse<'equipment.repair'>,q,g);
  }catch{if(g===this.generation&&this.pending===q)this.unknown();}
 }
}
