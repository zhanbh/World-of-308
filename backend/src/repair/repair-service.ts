import {parseAssetCommand,parseAssetQuery,parseAssetResponse,parseAssetQueryResponse} from '../../../shared/src/protocol/asset-v2.ts';
import type {AssetCommand,AssetQueryResponse} from '../../../shared/src/protocol/asset-v2.ts';
import type {Expected} from '../../../shared/src/protocol/session-v2.ts';
import {resource,time} from '../../../shared/src/exact-values.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
import type {Store,Clock,Transaction} from '../ports/store.ts';
import {canonical,CommitUnknown,StoreUnavailable} from '../ports/store.ts';
import type {IdentityPort} from '../identity/identity-v2.ts';
import {identityKey,isVerifiedIdentity,loginKey} from '../identity/identity-v2.ts';
import type {IdentityLink,LoginAccount,LoginSession} from '../identity/login-model.ts';
import type {CharacterEntity,ContainerEntity,EquipmentEntity} from '../character/character-model.ts';
import type {ServiceContextEntity,TownMapManifest} from '../town/town-model.ts';
import {DEFAULT_TOWN_MAP} from '../town/town-model.ts';
import type {WalletEntity} from '../shop/shop-model.ts';
import type {SetBonusConfig} from '../equipment/equipment-model.ts';
import {aggregateCombatAttributes,WEARABLE_SLOTS} from '../equipment/equipment-rules.ts';
import {toEquipmentView} from '../equipment/equipment-service.ts';
export interface RepairConfig {profile:'local-test';authorization:'isolated-local-assets-only';ref:string;contextTtlMs:number;prices:Record<string,Partial<Record<EquipmentEntity['quality'],string>>>;}
type RepairCommand=Extract<AssetCommand,{command:'equipment.repair'}>;
interface Receipt {schemaVersion:2;id:string;accountId:string;command:'equipment.repair';tuple:string;result:ReturnType<typeof parseAssetResponse<'equipment.repair'>>;}
class Refusal extends Error {}
function requireValue(v:unknown,code:string):asserts v {if(!v)throw new Refusal(code);}
function inc(v:number){requireValue(Number.isSafeInteger(v)&&v>=0&&Number.isSafeInteger(v+1),'CONFIG_NOT_READY');return v+1;}
function budget(v:unknown,max=131072){requireValue(new TextEncoder().encode(JSON.stringify(v)).length<=max,'CONFIG_NOT_READY');}
/** Quotes are bounded read-only projections. A transaction recomputes the entire binding. */
export class RepairService {
 private options:{store:Store;clock:Clock;identity:IdentityPort;config?:RepairConfig;manifest:TownMapManifest;setConfigs?:Record<string,SetBonusConfig>};
 constructor(options:{store:Store;clock:Clock;identity:IdentityPort;config?:RepairConfig;manifest?:TownMapManifest;setConfigs?:Record<string,SetBonusConfig>}){this.options={...options,config:options.config&&structuredClone(options.config),manifest:structuredClone(options.manifest??DEFAULT_TOWN_MAP),setConfigs:options.setConfigs&&structuredClone(options.setConfigs)};}
 private config(){const c=this.options.config;requireValue(c&&c.profile==='local-test'&&c.authorization==='isolated-local-assets-only'&&/^[A-Za-z0-9_-]{1,64}$/.test(c.ref)&&Number.isSafeInteger(c.contextTtlMs)&&c.contextTtlMs>0&&c.contextTtlMs<=60000,'CONFIG_NOT_READY');return c;}
 private async caller(){try{const i=await this.options.identity.verify();requireValue(isVerifiedIdentity(i),'AUTH_REQUIRED');return{id:await identityKey(i),tuple:JSON.stringify([i.provider,i.appId,i.subject,i.environment])};}catch{throw new Refusal('AUTH_REQUIRED');}}
 private async authorize(tx:Transaction,caller:{id:string;tuple:string},sessionId:string,epoch:number){
  const l=await tx.get<IdentityLink>(caller.id);requireValue(l?.schemaVersion===2&&l.id===caller.id&&l.tuple===caller.tuple,'AUTH_REQUIRED');
  const a=await tx.get<LoginAccount>(l.accountId),s=await tx.get<LoginSession>(sessionId);
  requireValue(a?.schemaVersion===2&&a.id===l.accountId&&s?.schemaVersion===2&&s.id===sessionId&&s.accountId===a.id&&s.status==='active'&&s.epoch===epoch&&a.currentSessionId===sessionId&&a.sessionEpoch===epoch,'SESSION_REVOKED');return a;
 }
 private async character(tx:Transaction,a:LoginAccount,id:string){const c=await tx.get<CharacterEntity>(id);requireValue(c?.schemaVersion===2&&c.id===id&&c.accountId===a.id&&a.selectedCharacterId===id&&Object.values(a.characterIdsByClass).includes(id),'NOT_FOUND_OR_FORBIDDEN');return c;}
 private async context(tx:Transaction,a:LoginAccount,c:CharacterEntity,id:string,now:number){
  const x=await tx.get<ServiceContextEntity>(id),t=c.townState,m=this.options.manifest;
  requireValue(x?.schemaVersion===2&&x.id===id&&x.accountId===a.id&&x.characterId===c.id&&x.status==='open'&&x.serviceKind==='repair'&&c.currentServiceContextId===id&&x.rolePlayEpoch===c.rolePlayEpoch&&t&&x.sceneEpoch===t.sceneEpoch&&x.locationRevision===t.locationRevision,'CONTEXT_INVALID');
  requireValue(c.location.kind==='town'&&c.location.mapId===m.mapId&&t.mapRef===m.mapId&&!a.activeChallengeId&&!a.openSceneChallengeId,'LOCATION_NOT_ALLOWED');
  const anchor=m.serviceAnchors[x.anchorId];requireValue(anchor?.serviceKind==='repair'&&Number.isFinite(t.position.x)&&Number.isFinite(t.position.y)&&(t.position.x-anchor.x)**2+(t.position.y-anchor.y)**2<=576,'LOCATION_NOT_ALLOWED');
  const expiresAt=x.issuedAt+this.config().contextTtlMs;requireValue(Number.isSafeInteger(expiresAt)&&now>=x.issuedAt&&now<expiresAt,'CONTEXT_INVALID');return{x,expiresAt};
 }
 private async target(tx:Transaction,a:LoginAccount,c:CharacterEntity,id:string){
  const item=await tx.get<EquipmentEntity>(id);requireValue(item?.schemaVersion===2&&item.id===id&&item.accountId===a.id&&item.lifecycle==='active'&&(!item.holderCharacterId||item.holderCharacterId===c.id),'ITEM_NOT_ELIGIBLE');
  requireValue(item.binding.kind!=='character'||item.binding.characterId===c.id,'ITEM_NOT_ELIGIBLE');
  requireValue(item.binding.kind==='none'||item.binding.accountId===a.id,'ITEM_NOT_ELIGIBLE');
  let bag:ContainerEntity|undefined;
  if(item.location.kind==='equipped')requireValue(item.location.characterId===c.id&&item.location.slotId===item.slotKind&&c.equipped[item.slotKind]===id,'ITEM_NOT_ELIGIBLE');
  else{requireValue(item.location.kind==='container'&&item.location.containerId===c.backpackId,'ITEM_NOT_ELIGIBLE');bag=await tx.get<ContainerEntity>(c.backpackId);requireValue(bag?.schemaVersion===2&&bag.id===c.backpackId&&bag.accountId===a.id&&bag.characterId===c.id&&bag.kind==='backpack'&&Object.values(bag.slots).filter(e=>e.kind==='equipment'&&e.itemId===id).length===1,'ITEM_NOT_ELIGIBLE');}
  if(bag){requireValue(Number.isSafeInteger(bag.capacity)&&bag.capacity>=20&&bag.capacity<=100&&Object.keys(bag.slots).length<=bag.capacity&&Object.keys(bag.slots).every(index=>Number.isInteger(Number(index))&&Number(index)>=0&&Number(index)<bag!.capacity),'CONFIG_NOT_READY');budget(bag,262144);}
  toEquipmentView(item);requireValue(WEARABLE_SLOTS.includes(item.slotKind)&&item.durability.wearEnabled&&item.durability.current!==null&&item.durability.max!==null,'ITEM_NOT_ELIGIBLE');return{item,bag};
 }
 private async plan(tx:Transaction,a:LoginAccount,c:CharacterEntity,contextId:string,selection:RepairCommand['payload']['target'],now:number){
  const {x,expiresAt}=await this.context(tx,a,c,contextId,now),items:EquipmentEntity[]=[];let bag:ContainerEntity|undefined;
  if(selection.kind==='single'){const target=await this.target(tx,a,c,selection.itemId);items.push(target.item);bag=target.bag;}
  else{
   for(const slot of WEARABLE_SLOTS){const id=c.equipped[slot];if(!id)continue;const target=await this.target(tx,a,c,id);requireValue(target.item.slotKind===slot&&target.item.location.kind==='equipped','ITEM_NOT_ELIGIBLE');items.push(target.item);}
   requireValue(new Set(items.map(i=>i.id)).size===items.length,'CONFIG_NOT_READY');
  }
  const w=await tx.get<WalletEntity>(a.walletId),config=this.config();
  requireValue(w?.schemaVersion===2&&w.id===a.walletId&&w.accountId===a.id,'CONFIG_NOT_READY');resource(w.gold);resource(w.points);
  const details={expiresAt,...selection.kind==='allWorn'?{target:{kind:'allWorn' as const}}:{},items:items.map(item=>{
   const unit=config.prices[String(item.itemLevel)]?.[item.quality];requireValue(unit!==undefined&&resource(unit)>0n,'CONFIG_NOT_READY');
   const missing=item.durability.max!-item.durability.current!,gold=String(resource(BigInt(missing)*resource(unit)));
   return{itemId:item.id,current:item.durability.current!,max:item.durability.max!,missing,unitGold:unit,gold};
  })};
  const gold=String(resource(details.items.reduce((sum,i)=>sum+resource(i.gold),0n)));
  const versions:Expected[]=[{kind:'character',id:c.id,version:c.version},...items.map(item=>({kind:'equipment' as const,id:item.id,version:item.version})),{kind:'wallet',id:w.id,version:w.version},...(bag?[{kind:'container' as const,id:bag.id,version:bag.version}]:[])];
  const quoteRef=await manifestDigest({accountId:a.id,sessionId:a.currentSessionId,sessionEpoch:a.sessionEpoch,characterId:c.id,rolePlayEpoch:c.rolePlayEpoch,context:x,versions,config,details,...selection.kind==='single'?{location:items[0].location}:{target:selection,locations:items.map(i=>i.location)}});
  return{items,bag,w,versions,quote:{quoteRef,serviceKind:'repair' as const,configRef:config.ref,costs:[{currency:'gold' as const,amount:gold}],materialCosts:[],targetVersions:versions,displayChanges:items.map(item=>({kind:'durability' as const,before:String(item.durability.current),after:String(item.durability.max)})),failureConsequences:[],repair:details}};
 }
 async query(value:unknown):Promise<AssetQueryResponse>{
  const q=parseAssetQuery(value);if(q.query!=='service.quote'&&q.query!=='operation.get'&&q.query!=='repair.get')throw new TypeError('UNSUPPORTED_QUERY');
  const reply=(body:unknown)=>parseAssetQueryResponse(q.query,{requestId:q.requestId,serverTime:time(this.options.clock.now()),...body as object});
  try{const caller=await this.caller();return await this.options.store.run(async tx=>{
   const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch);
   if(q.query==='operation.get'){const id=await loginKey('assetOp',[a.id,q.payload.operationId]),o=await tx.get<Receipt>(id);if(!o)return reply({versions:[],data:{status:'notFound'}});requireValue(o.schemaVersion===2&&o.id===id&&o.accountId===a.id ,'SERVICE_UNAVAILABLE');return reply({versions:[],data:{status:'found',command:o.command,result:o.result}});}
   const c=await this.character(tx,a,q.payload.characterId);
   if(q.query==='repair.get'){
    const selection='target' in q.payload?q.payload.target:{kind:'single' as const,itemId:q.payload.itemId};
    const p=await this.plan(tx,a,c,q.payload.contextId,selection,this.options.clock.now()),known=new Map(p.items.map(i=>[i.id,i])),worn:Record<string,EquipmentEntity>={};
    for(const [slot,id] of Object.entries(c.equipped)){const item=known.get(id!)??await tx.get<EquipmentEntity>(id!);requireValue(item?.schemaVersion===2&&item.accountId===a.id&&item.lifecycle==='active'&&item.location.kind==='equipped'&&item.location.characterId===c.id&&item.location.slotId===slot,'CONFIG_NOT_READY');worn[slot]=item;}
    const attributes=aggregateCombatAttributes(worn,this.options.setConfigs);
    return reply({versions:p.versions,data:{contextId:q.payload.contextId,characterId:c.id,characterVersion:c.version,statsVersion:c.statsVersion,...selection.kind==='single'?{item:toEquipmentView(p.items[0])}:{target:selection,items:p.items.map(toEquipmentView)},wallet:{walletId:p.w.id,version:p.w.version,gold:p.w.gold,points:p.w.points},attributes}});
   }
   const intent=q.payload.serviceIntent;requireValue(intent.command==='equipment.repair','INVALID_ARGUMENT');const p=intent.payload as RepairCommand['payload'];
   const plan=await this.plan(tx,a,c,q.payload.contextId,p.target,this.options.clock.now());return reply({versions:plan.versions,data:plan.quote});
  });}catch(e){if(e instanceof Refusal)return reply({error:{code:e.message}});if(e instanceof StoreUnavailable||e instanceof CommitUnknown)return reply({error:{code:'SERVICE_UNAVAILABLE'}});if(e instanceof TypeError||e instanceof RangeError)return reply({error:{code:'CONFIG_NOT_READY'}});throw e;}
 }
 async execute(value:unknown){
  const q=parseAssetCommand(value);if(q.command!=='equipment.repair')throw new TypeError('UNSUPPORTED_COMMAND');
  const reply=(outcome:unknown,replayed=false)=>parseAssetResponse('equipment.repair',{operationId:q.operationId,serverTime:time(this.options.clock.now()),replayed,outcome});
  try{const caller=await this.caller();return await this.options.store.run(async tx=>{
   const now=this.options.clock.now(),a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),id=await loginKey('assetOp',[a.id,q.operationId]),journalId=await loginKey('assetJournal',[a.id,q.operationId]),tuple=canonical(q),old=await tx.get<Receipt>(id);
   if(old){requireValue(old.schemaVersion===2&&old.id===id&&old.accountId===a.id,'SERVICE_UNAVAILABLE');requireValue(old.command===q.command&&old.tuple===tuple,'OPERATION_MISMATCH');return parseAssetResponse('equipment.repair',{...old.result,serverTime:now,replayed:true});}
   requireValue(await tx.get(journalId)===undefined,'SERVICE_UNAVAILABLE');const c=await this.character(tx,a,q.payload.characterId);
   // Refusals are durable too; no asset writes occur before all decisions pass.
   let outcome:unknown,changes:unknown=null;
   try{
    const p=await this.plan(tx,a,c,q.payload.contextId,q.payload.target,now);
    requireValue(p.versions.every(e=>{const v=q.expected.find(v=>v.kind===e.kind&&v.id===e.id);return !v||v.version===e.version;}),'VERSION_CONFLICT');
    requireValue(q.expected.length===p.versions.length&&p.versions.every(e=>q.expected.some(v=>v.kind===e.kind&&v.id===e.id)),'INVALID_ARGUMENT');
    requireValue(p.versions.every(e=>q.expected.some(v=>v.kind===e.kind&&v.id===e.id&&v.version===e.version)),'VERSION_CONFLICT');
    requireValue(q.payload.quoteRef===p.quote.quoteRef,'QUOTE_CHANGED');const cost=resource(p.quote.costs[0].amount);requireValue(resource(p.w.gold)>=cost,'CURRENCY_NOT_ENOUGH');
    const nextItems=p.items.map(item=>item.durability.current===item.durability.max?item:{...item,version:inc(item.version),updatedAt:now,durability:{...item.durability,current:item.durability.max}});
    const changedItems=nextItems.filter((item,index)=>item!==p.items[index]);let nextC=c,nextW=p.w;
    if(changedItems.length){
     if(q.payload.target.kind==='allWorn'||p.items[0].location.kind==='equipped'){
      const known=new Map(p.items.map(item=>[item.id,item])),worn:Record<string,EquipmentEntity>={};
      for(const [slot,itemId] of Object.entries(c.equipped)){const item=known.get(itemId!)??await tx.get<EquipmentEntity>(itemId!);requireValue(item?.schemaVersion===2&&item.accountId===a.id&&item.lifecycle==='active'&&item.location.kind==='equipped'&&item.location.characterId===c.id&&item.location.slotId===slot,'CONFIG_NOT_READY');worn[slot]=item;}
      const nextWorn={...worn};for(const item of changedItems)nextWorn[item.slotKind]=item;
      const before=aggregateCombatAttributes(worn,this.options.setConfigs),after=aggregateCombatAttributes(nextWorn,this.options.setConfigs);
      nextC={...c,version:inc(c.version),statsVersion:canonical(before)!==canonical(after)?inc(c.statsVersion):c.statsVersion,updatedAt:now};
     }else nextC={...c,version:inc(c.version),updatedAt:now};
     nextW={...p.w,gold:String(resource(p.w.gold)-cost),version:inc(p.w.version),updatedAt:now};
     const nextA={...a,writeRevision:inc(a.writeRevision)};
     // Validate the entire batch before staging any asset; a refusal cannot commit a prefix.
     for(const v of [...changedItems,nextC,nextW,nextA])budget(v);
     const deltas=changedItems.map(item=>{const before=p.items.find(i=>i.id===item.id)!;return{id:item.id,before:before.durability.current,after:item.durability.current,beforeVersion:before.version,afterVersion:item.version};});
     changes={...q.payload.target.kind==='single'?{item:deltas[0]}:{items:deltas},wallet:{id:p.w.id,goldBefore:p.w.gold,goldAfter:nextW.gold,beforeVersion:p.w.version,afterVersion:nextW.version},character:{id:c.id,beforeVersion:c.version,afterVersion:nextC.version,statsBefore:c.statsVersion,statsAfter:nextC.statsVersion}};
     for(const item of changedItems)tx.set(item.id,item);tx.set(nextC.id,nextC);tx.set(nextW.id,nextW);tx.set(a.id,nextA);
    }
    const versions:Expected[]=[{kind:'character',id:c.id,version:nextC.version},...nextItems.map(item=>({kind:'equipment' as const,id:item.id,version:item.version})),{kind:'wallet',id:p.w.id,version:nextW.version}];
    outcome={status:'committed',data:{repairedItemIds:changedItems.map(i=>i.id),chargedGold:String(cost)},resultVersions:versions};
   }catch(e){if(e instanceof Refusal)outcome={status:'rejected',code:e.message};else throw e;}
   const result=reply(outcome),receipt:Receipt={schemaVersion:2,id,accountId:a.id,command:q.command,tuple,result};budget(receipt,16384);
   const journal={schemaVersion:2,id:journalId,accountId:a.id,operationId:q.operationId,command:q.command,quoteRef:q.payload.quoteRef,configRef:this.options.config?.ref??null,configHash:await manifestDigest(this.options.config??null),source:{kind:'repair',contextId:q.payload.contextId},target:q.payload.target,expected:q.expected,changes,outcome:result.outcome,createdAt:now};budget(journal);tx.set(journalId,journal);tx.set(id,receipt);return result;
  });}catch(e){if(e instanceof Refusal)return reply({status:'rejected',code:e.message});if(e instanceof CommitUnknown)return reply({status:'unknown',code:'RESULT_UNKNOWN'});if(e instanceof StoreUnavailable)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});if(e instanceof TypeError||e instanceof RangeError)return reply({status:'rejected',code:'CONFIG_NOT_READY'});throw e;}
 }
}
