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
import type {SetBonusConfig,EquipmentCatalog,RankingEntryEntity} from '../equipment/equipment-model.ts';
import {aggregateCombatAttributes,calculateTotalScore,Refusal as EquipmentRefusal} from '../equipment/equipment-rules.ts';
import {toEquipmentView} from '../equipment/equipment-service.ts';
import {characterKey} from '../character/character-service.ts';

/** Explicit isolated candidate; no fallback prices, probabilities or production authorization. */
export interface EnhancementConfig {
 profile:'local-test';authorization:'isolated-local-assets-only';ref:string;contextTtlMs:number;
 probabilityScale:1000000;probabilityCap:number;luckPerPoint:number;luckCap:number;memoryStep:number;memorySourceCap:number;memoryTotalCap:number;distanceWeights:number[];
 goldByItemLevel:Record<string,{weapon:string[];earring:string[]}>;materialTemplateRef:string;materialsByTarget:number[];earringAttackPowerByTarget:string[];
}
/** Must return the same secret uniform millionth for the same original intent across process restarts. */
export interface EnhancementRandom {sample(originalIntent:string):Promise<number>;}
export class KeyedEnhancementRandom implements EnhancementRandom {
 private secret:Uint8Array;
 constructor(secret:Uint8Array){if(secret.length<32)throw new TypeError('RANDOM_SECRET_TOO_SHORT');this.secret=new Uint8Array(secret);}
 async sample(originalIntent:string){const key=await crypto.subtle.importKey('raw',this.secret as Uint8Array<ArrayBuffer>,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  // Rejection sampling avoids modulo bias; deterministic counter never consumes another user attempt.
  for(let i=0;i<128;i++){const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(JSON.stringify([originalIntent,i]))));const n=new DataView(bytes.buffer).getUint32(0);if(n<4294000000)return n%1000000;}throw new Error('RANDOM_UNAVAILABLE');}
}
type Command=Extract<AssetCommand,{command:'equipment.enhance'}>;
interface Memory {schemaVersion:2;id:string;accountId:string;characterId:string;rolePlayEpoch:number;configRef:string;values:number[];version:number;}
interface Receipt {schemaVersion:2;id:string;accountId:string;command:string;tuple:string;result:ReturnType<typeof parseAssetResponse>;}
class Refusal extends Error {}
function check(v:unknown,code='CONFIG_NOT_READY'):asserts v {if(!v)throw new Refusal(code);}
function inc(n:number){check(Number.isSafeInteger(n)&&n>=0&&Number.isSafeInteger(n+1));return n+1;}
function budget(v:unknown,max=131072){check(new TextEncoder().encode(JSON.stringify(v)).length<=max);}
const base=[800000,800000,800000,800000,800000,700000,700000,600000,600000,600000];
export class EnhancementService {
 private options:{store:Store;clock:Clock;identity:IdentityPort;config?:EnhancementConfig;random:EnhancementRandom;manifest:TownMapManifest;setConfigs?:Record<string,SetBonusConfig>;catalog?:EquipmentCatalog};
 constructor(options:{store:Store;clock:Clock;identity:IdentityPort;config?:EnhancementConfig;random:EnhancementRandom;manifest?:TownMapManifest;setConfigs?:Record<string,SetBonusConfig>;catalog?:EquipmentCatalog}){this.options={...options,config:options.config&&structuredClone(options.config),manifest:structuredClone(options.manifest??DEFAULT_TOWN_MAP),catalog:options.catalog&&structuredClone(options.catalog),setConfigs:options.setConfigs&&structuredClone(options.setConfigs)};}
 private config(){const c=this.options.config;check(c&&c.profile==='local-test'&&c.authorization==='isolated-local-assets-only'&&/^[A-Za-z0-9_-]{1,64}$/.test(c.ref)&&Number.isSafeInteger(c.contextTtlMs)&&c.contextTtlMs>0&&c.contextTtlMs<=60000);
  check(c.probabilityScale===1000000&&Number.isSafeInteger(c.probabilityCap)&&c.probabilityCap>=800000&&c.probabilityCap<1000000);
  for(const n of [c.luckPerPoint,c.luckCap,c.memoryStep,c.memorySourceCap,c.memoryTotalCap])check(Number.isSafeInteger(n)&&n>0&&n<=1000000);
  check(c.memoryStep<=c.memorySourceCap&&c.memoryTotalCap<=c.probabilityCap&&c.distanceWeights.length===20&&c.distanceWeights[0]===1000000);
  c.distanceWeights.forEach((n,i)=>check(Number.isSafeInteger(n)&&n>=0&&n<=1000000&&(!i||n<=c.distanceWeights[i-1])));
  check(c.materialTemplateRef.length>0&&c.materialTemplateRef.length<=128&&c.materialsByTarget.length===10&&c.earringAttackPowerByTarget.length===10);
  c.materialsByTarget.forEach(n=>check(Number.isSafeInteger(n)&&n>=1&&n<=20));let previous=0n,previousDelta=0n;for(const v of c.earringAttackPowerByTarget){const n=resource(v),delta=n-previous;check(delta>previousDelta&&n%2n===0n&&n<=1000000000n);previous=n;previousDelta=delta;}
  for(const [level,p] of Object.entries(c.goldByItemLevel)){check(['10','15','20','25','30'].includes(level)&&p.weapon.length===10&&p.earring.length===10);for(let i=0;i<10;i++)check(resource(p.weapon[i])>resource(p.earring[i])&&resource(p.earring[i])>0n);}
  budget(c,16384);return c;
 }
 private async caller(){try{const i=await this.options.identity.verify();check(isVerifiedIdentity(i),'AUTH_REQUIRED');return{id:await identityKey(i),tuple:JSON.stringify([i.provider,i.appId,i.subject,i.environment])};}catch{throw new Refusal('AUTH_REQUIRED');}}
 private async authorize(tx:Transaction,caller:{id:string;tuple:string},sessionId:string,epoch:number){const l=await tx.get<IdentityLink>(caller.id);check(l?.schemaVersion===2&&l.id===caller.id&&l.tuple===caller.tuple,'AUTH_REQUIRED');const a=await tx.get<LoginAccount>(l.accountId),s=await tx.get<LoginSession>(sessionId);check(a?.schemaVersion===2&&a.id===l.accountId&&s?.schemaVersion===2&&s.id===sessionId&&s.accountId===a.id&&s.status==='active'&&s.epoch===epoch&&a.currentSessionId===sessionId&&a.sessionEpoch===epoch,'SESSION_REVOKED');return a;}
 private async character(tx:Transaction,a:LoginAccount,id:string){const c=await tx.get<CharacterEntity>(id);check(c?.schemaVersion===2&&c.id===id&&c.accountId===a.id&&a.selectedCharacterId===id&&Object.values(a.characterIdsByClass).includes(id),'NOT_FOUND_OR_FORBIDDEN');return c;}
 private async plan(tx:Transaction,a:LoginAccount,c:CharacterEntity,p:Command['payload'],now:number,readOnly=false){
  const config=this.config(),x=await tx.get<ServiceContextEntity>(p.contextId),t=c.townState,m=this.options.manifest;
  check(x?.schemaVersion===2&&x.id===p.contextId&&x.accountId===a.id&&x.characterId===c.id&&x.status==='open'&&x.serviceKind==='enhance'&&c.currentServiceContextId===x.id&&x.rolePlayEpoch===c.rolePlayEpoch&&t&&x.sceneEpoch===t.sceneEpoch&&x.locationRevision===t.locationRevision,'CONTEXT_INVALID');
  check(c.location.kind==='town'&&c.location.mapId===m.mapId&&t.mapRef===m.mapId&&!a.activeChallengeId&&!a.openSceneChallengeId,'LOCATION_NOT_ALLOWED');const anchor=m.serviceAnchors[x.anchorId];check(anchor?.serviceKind==='enhance'&&Number.isFinite(t.position.x)&&Number.isFinite(t.position.y)&&(t.position.x-anchor.x)**2+(t.position.y-anchor.y)**2<=576,'LOCATION_NOT_ALLOWED');check(now>=x.issuedAt&&now<x.issuedAt+config.contextTtlMs,'CONTEXT_INVALID');
  const item=await tx.get<EquipmentEntity>(p.itemId),bag=await tx.get<ContainerEntity>(c.backpackId),w=await tx.get<WalletEntity>(a.walletId);
  check(item?.schemaVersion===2&&item.id===p.itemId&&item.accountId===a.id&&item.lifecycle==='active'&&(!item.holderCharacterId||item.holderCharacterId===c.id)&&['weapon','earring'].includes(item.slotKind),'ITEM_NOT_ELIGIBLE');
  check((item.binding.kind!=='character'||item.binding.characterId===c.id)&&(item.binding.kind==='none'||item.binding.accountId===a.id),'ITEM_NOT_ELIGIBLE');toEquipmentView(item);
  check(bag?.schemaVersion===2&&bag.id===c.backpackId&&bag.accountId===a.id&&bag.characterId===c.id&&bag.kind==='backpack');check(Number.isSafeInteger(bag.capacity)&&bag.capacity>=20&&bag.capacity<=100&&Object.keys(bag.slots).length<=bag.capacity&&Object.keys(bag.slots).every(k=>Number.isInteger(Number(k))&&Number(k)>=0&&Number(k)<bag.capacity));budget(bag,65536);
  const entries=Object.entries(bag.slots),equipped=item.location.kind==='equipped';
  if(equipped)check(item.location.kind==='equipped'&&item.location.characterId===c.id&&item.location.slotId===item.slotKind&&c.equipped[item.slotKind]===item.id&&!entries.some(([,s])=>s.kind==='equipment'&&s.itemId===item.id),'ITEM_NOT_ELIGIBLE');
  else check(item.location.kind==='container'&&item.location.containerId===bag.id&&entries.filter(([,s])=>s.kind==='equipment'&&s.itemId===item.id).length===1&&!Object.values(c.equipped).includes(item.id),'ITEM_NOT_ELIGIBLE');
  check((readOnly || p.targetLevel===item.enhancementLevel+1)&&p.targetLevel<=10&&item.enhancementLevel<=10&&!p.useMemento,'ITEM_NOT_ELIGIBLE');
  const ap=(level:number)=>level===0?'0':String(resource(config.earringAttackPowerByTarget[level-1])*(item.slotKind==='weapon'?3n:2n)/2n);
  if(item.enhancementLevel>0)check(item.enhancementBonus?.configRef===config.ref&&item.enhancementBonus.level===item.enhancementLevel&&item.enhancementBonus.attackPower===ap(item.enhancementLevel));else check(!item.enhancementBonus);
  check(w?.schemaVersion===2&&w.id===a.walletId&&w.accountId===a.id);resource(w.gold);resource(w.points);
  const gold=config.goldByItemLevel[String(item.itemLevel)]?.[item.slotKind as 'weapon'|'earring']?.[p.targetLevel-1];check(gold!==undefined);resource(gold);
  const memoryId=await loginKey('enhancementMemory',[c.id,c.rolePlayEpoch]);const prior=await tx.get<Memory>(memoryId),memory=prior??{schemaVersion:2 as const,id:memoryId,accountId:a.id,characterId:c.id,rolePlayEpoch:c.rolePlayEpoch,configRef:config.ref,values:Array(20).fill(0),version:0};
  check(memory.schemaVersion===2&&memory.id===memoryId&&memory.accountId===a.id&&memory.characterId===c.id&&memory.rolePlayEpoch===c.rolePlayEpoch&&memory.configRef===config.ref&&memory.values.length===20&&Number.isSafeInteger(memory.version)&&memory.version>=0&&memory.values.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=config.memorySourceCap));
  const versions:Expected[]=[{kind:'character',id:c.id,version:c.version},{kind:'equipment',id:item.id,version:item.version},{kind:'wallet',id:w.id,version:w.version},{kind:'container',id:bag.id,version:bag.version}];
  const material=config.materialsByTarget[p.targetLevel-1],quoteBase={serviceKind:'enhance' as const,configRef:config.ref,costs:[{currency:'gold' as const,amount:gold}],materialCosts:[{templateRef:config.materialTemplateRef,quantity:material}],targetVersions:versions,displayChanges:[{kind:'enhancementLevel' as const,before:String(item.enhancementLevel),after:String(p.targetLevel)},{kind:'attackPower' as const,before:ap(item.enhancementLevel),after:ap(p.targetLevel)}],failureConsequences:['preserve' as const]};
  const worn:Record<string,EquipmentEntity>={};for(const [slot,id]of Object.entries(c.equipped)){const i=id===item.id?item:await tx.get<EquipmentEntity>(id!);check(i?.accountId===a.id&&i.lifecycle==='active'&&i.location.kind==='equipped'&&i.location.characterId===c.id&&i.location.slotId===slot);toEquipmentView(i);worn[slot]=i;}
  const luck=aggregateCombatAttributes(worn,this.options.setConfigs).find(v=>v.statId==='luck')?.value??'0';const luckBonus=Number(resource(luck)*BigInt(config.luckPerPoint)>BigInt(config.luckCap)?BigInt(config.luckCap):resource(luck)*BigInt(config.luckPerPoint));
  const quoteRef=await manifestDigest({accountId:a.id,sessionId:a.currentSessionId,sessionEpoch:a.sessionEpoch,characterId:c.id,rolePlayEpoch:c.rolePlayEpoch,context:x,versions,config,memory,quoteBase,luckBonus,item:toEquipmentView(item)});
  return{item,bag,w,memory,config,equipped,luckBonus,ap:ap(p.targetLevel),material,gold,versions,quote:{...quoteBase,quoteRef}};
 }
 async query(value:unknown):Promise<AssetQueryResponse>{const q=parseAssetQuery(value);if(q.query!=='service.quote'&&q.query!=='operation.get'&&q.query!=='enhancement.get')throw new TypeError('UNSUPPORTED_QUERY');const reply=(body:unknown)=>parseAssetQueryResponse(q.query,{requestId:q.requestId,serverTime:time(this.options.clock.now()),...body as object});
  try{const caller=await this.caller();return await this.options.store.run(async tx=>{const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch);if(q.query==='operation.get'){const id=await loginKey('assetOp',[a.id,q.payload.operationId]),o=await tx.get<Receipt>(id);if(!o)return reply({versions:[],data:{status:'notFound'}});check(o.schemaVersion===2&&o.id===id&&o.accountId===a.id,'SERVICE_UNAVAILABLE');return reply({versions:[],data:{status:'found',command:o.command,result:o.result}});}
   const c=await this.character(tx,a,q.payload.characterId);
   if(q.query==='service.quote'){check(q.payload.serviceIntent.command==='equipment.enhance','INVALID_ARGUMENT');const p=await this.plan(tx,a,c,q.payload.serviceIntent.payload as Command['payload'],this.options.clock.now());return reply({versions:p.versions,data:p.quote});}
   const item=await tx.get<EquipmentEntity>(q.payload.itemId);check(item,'ITEM_NOT_ELIGIBLE');
   // A level-10 result remains observable although another low-grade attempt is ineligible.
   const p=await this.plan(tx,a,c,{characterId:c.id,contextId:q.payload.contextId,itemId:item.id,targetLevel:Math.min(item.enhancementLevel+1,10),useMemento:false,quoteRef:'unquoted'},this.options.clock.now(),true);
   const worn:Record<string,EquipmentEntity>={};for(const [slot,id]of Object.entries(c.equipped)){const i=id===p.item.id?p.item:await tx.get<EquipmentEntity>(id!);check(i?.accountId===a.id&&i.lifecycle==='active'&&i.location.kind==='equipped'&&i.location.characterId===c.id&&i.location.slotId===slot);toEquipmentView(i);worn[slot]=i;}
   return reply({versions:p.versions,data:{contextId:q.payload.contextId,characterId:c.id,characterVersion:c.version,statsVersion:c.statsVersion,item:toEquipmentView(p.item),wallet:{walletId:p.w.id,version:p.w.version,gold:p.w.gold,points:p.w.points},attributes:aggregateCombatAttributes(worn,this.options.setConfigs)}});
  });}catch(e){if(e instanceof Refusal)return reply({error:{code:e.message}});if(e instanceof CommitUnknown||e instanceof StoreUnavailable)return reply({error:{code:'SERVICE_UNAVAILABLE'}});if(e instanceof TypeError||e instanceof RangeError||e instanceof EquipmentRefusal)return reply({error:{code:'CONFIG_NOT_READY'}});throw e;}}
 async execute(value:unknown){const q=parseAssetCommand(value);if(q.command!=='equipment.enhance')throw new TypeError('UNSUPPORTED_COMMAND');const reply=(outcome:unknown)=>parseAssetResponse('equipment.enhance',{operationId:q.operationId,serverTime:time(this.options.clock.now()),replayed:false,outcome});let fixedSample:Promise<number>|undefined;
  try{const caller=await this.caller();return await this.options.store.run(async tx=>{const a=await this.authorize(tx,caller,q.sessionId,q.sessionEpoch),now=this.options.clock.now(),id=await loginKey('assetOp',[a.id,q.operationId]),jid=await loginKey('assetJournal',[a.id,q.operationId]),tuple=canonical(q),old=await tx.get<Receipt>(id);
   if(old){check(old.schemaVersion===2&&old.id===id&&old.accountId===a.id,'SERVICE_UNAVAILABLE');check(old.command===q.command&&old.tuple===tuple,'OPERATION_MISMATCH');return parseAssetResponse('equipment.enhance',{...old.result,serverTime:now,replayed:true});}check(await tx.get(jid)===undefined,'SERVICE_UNAVAILABLE');
   const c=await this.character(tx,a,q.payload.characterId);let outcome:unknown,changes:unknown=null;
   try{const p=await this.plan(tx,a,c,q.payload,now);check(q.expected.length===p.versions.length&&p.versions.every(e=>q.expected.some(v=>v.kind===e.kind&&v.id===e.id)),'INVALID_ARGUMENT');check(p.versions.every(e=>q.expected.some(v=>v.kind===e.kind&&v.id===e.id&&v.version===e.version)),'VERSION_CONFLICT');check(q.payload.quoteRef===p.quote.quoteRef,'QUOTE_CHANGED');check(resource(p.w.gold)>=resource(p.gold),'CURRENCY_NOT_ENOUGH');
    const nextBag=structuredClone(p.bag);let remaining=p.material;const flows:Array<{stackId:string;traceRef:string;quantity:number}>=[];const candidates=Object.entries(nextBag.slots).filter(([,s])=>s.kind==='stack'&&s.templateRef.id===p.config.materialTemplateRef).sort(([ai,a],[bi,b])=>{const rank=(s:typeof a)=>s.kind==='stack'?(s.binding.kind==='character'?0:s.binding.kind==='account'?1:2):3;return rank(a)-rank(b)||Number(ai)-Number(bi);});
    for(const [index,s] of candidates){if(s.kind!=='stack')continue;check(Number.isSafeInteger(s.quantity)&&s.quantity>=1&&s.quantity<=20&&s.traceRef.length>0);if(s.binding.kind==='character'&&s.binding.characterId!==c.id||s.binding.kind!=='none'&&s.binding.accountId!==a.id)continue;const n=Math.min(s.quantity,remaining);if(n){flows.push({stackId:s.stackId,traceRef:s.traceRef,quantity:n});remaining-=n;s.quantity-=n;if(!s.quantity)delete nextBag.slots[Number(index)];else s.traceRef=jid+':output:'+index;}if(!remaining)break;}check(!remaining,'MATERIAL_NOT_ENOUGH');
    fixedSample??=this.options.random.sample(JSON.stringify([a.id,q.operationId]));const sample=await fixedSample;check(Number.isSafeInteger(sample)&&sample>=0&&sample<1000000);let bonus=0;for(let i=0;i<20;i++)bonus+=Math.floor(p.memory.values[i]*p.config.distanceWeights[Math.abs(i+1-q.payload.targetLevel)]/1000000);const threshold=Math.min(p.config.probabilityCap,base[q.payload.targetLevel-1]+p.luckBonus+Math.min(p.config.memoryTotalCap,bonus));const success=sample<threshold;
    const values=p.memory.values.map((n,i)=>success?Math.floor(n*(1000000-p.config.distanceWeights[Math.abs(i+1-q.payload.targetLevel)])/1000000):n);if(!success)values[q.payload.targetLevel-1]=Math.min(p.config.memorySourceCap,values[q.payload.targetLevel-1]+p.config.memoryStep);
    const nextMemory={...p.memory,values,version:inc(p.memory.version)},nextItem=success?{...p.item,enhancementLevel:q.payload.targetLevel,enhancementBonus:{configRef:p.config.ref,level:q.payload.targetLevel,attackPower:p.ap},version:inc(p.item.version),updatedAt:now}:p.item;
    const worn:Record<string,EquipmentEntity>={};if(p.equipped)for(const [slot,itemId]of Object.entries(c.equipped)){const i=itemId===p.item.id?p.item:await tx.get<EquipmentEntity>(itemId!);check(i?.accountId===a.id&&i.lifecycle==='active'&&i.location.kind==='equipped'&&i.location.characterId===c.id&&i.location.slotId===slot);toEquipmentView(i);worn[slot]=i;}
    let nextC={...c,version:inc(c.version),updatedAt:now};const writes:Array<[string,unknown]>=[];
    if(success){writes.push([nextItem.id,nextItem]);if(p.equipped){const after={...worn,[p.item.slotKind]:nextItem},score=calculateTotalScore(after,this.options.catalog),changed=score!==(c.score??0),ev=inc(c.equipmentVersion);nextC={...nextC,statsVersion:canonical(aggregateCombatAttributes(worn,this.options.setConfigs))!==canonical(aggregateCombatAttributes(after,this.options.setConfigs))?inc(c.statsVersion):c.statsVersion,equipmentVersion:ev,score,scoreConfigRef:'score-v1',scoreReachedAt:changed?now:(c.scoreReachedAt??now)};const rid=await characterKey('rankingEntry',[c.id]);await tx.get(rid);const rank:RankingEntryEntity={schemaVersion:2,id:rid,characterId:c.id,accountId:a.id,classId:c.classId,characterName:c.characterName,level:c.level,score:String(score),scoreConfigRef:'score-v1',equipmentVersion:ev,scoreReachedAt:nextC.scoreReachedAt!,projectionVersion:ev,updatedAt:now};writes.push([rid,rank]);}}
    const nextW={...p.w,gold:String(resource(p.w.gold)-resource(p.gold)),version:inc(p.w.version),updatedAt:now};nextBag.version=inc(nextBag.version);nextBag.updatedAt=now;
    writes.push([nextMemory.id,nextMemory],[nextBag.id,nextBag],[nextW.id,nextW],[c.id,nextC],[a.id,{...a,writeRevision:inc(a.writeRevision)}]);for(const [,v]of writes)budget(v);
    changes={outputs:Object.entries(nextBag.slots).filter(([,v])=>v.kind==='stack'&&v.traceRef.startsWith(jid+':output:')).map(([index,v])=>({index,...v})),configRef:p.config.ref,configHash:await manifestDigest(p.config),sample,threshold,memoryBefore:p.memory,memoryAfter:nextMemory,materialFlows:flows,wallet:{before:p.w.gold,after:nextW.gold},item:{before:toEquipmentView(p.item),after:toEquipmentView(nextItem)}};
    outcome={status:'committed',data:{itemId:p.item.id,targetLevel:q.payload.targetLevel,result:success?'success':'failed',deliveryRefs:[]},resultVersions:[{kind:'character',id:c.id,version:nextC.version},{kind:'equipment',id:p.item.id,version:nextItem.version},{kind:'wallet',id:p.w.id,version:nextW.version},{kind:'container',id:nextBag.id,version:nextBag.version}]};for(const [key,v]of writes)tx.set(key,v);
   }catch(e){if(e instanceof Refusal)outcome={status:'rejected',code:e.message};else throw e;}
   const result=reply(outcome),receipt:Receipt={schemaVersion:2,id,accountId:a.id,command:q.command,tuple,result},journal={schemaVersion:2,id:jid,accountId:a.id,operationId:q.operationId,command:q.command,quoteRef:q.payload.quoteRef,source:{kind:'enhancement',contextId:q.payload.contextId},expected:q.expected,changes,outcome:result.outcome,createdAt:now};budget(receipt,16384);budget(journal);tx.set(jid,journal);tx.set(id,receipt);return result;
  });}catch(e){if(e instanceof Refusal)return reply({status:'rejected',code:e.message});if(e instanceof CommitUnknown)return reply({status:'unknown',code:'RESULT_UNKNOWN'});if(e instanceof StoreUnavailable)return reply({status:'rejected',code:'SERVICE_UNAVAILABLE'});if(e instanceof TypeError||e instanceof RangeError||e instanceof EquipmentRefusal)return reply({status:'rejected',code:'CONFIG_NOT_READY'});throw e;}}
}
