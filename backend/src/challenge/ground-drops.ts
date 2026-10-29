import {toEquipmentView} from '../equipment/equipment-service.ts';
import {parseContainerView,parseHoldingsView} from '../../../shared/src/protocol/asset-v2.ts';
import {manifestDigest} from '../../../shared/src/room-manifest.ts';
import {canonical} from '../ports/store.ts';
import type {EquipmentEntity} from '../character/character-model.ts';
import type {EntryChallenge} from './challenge-model.ts';
import type {BankHoldingsDomain} from '../bank/bank-service.ts';
import {loginKey} from '../identity/identity-v2.ts';
export type DropCandidate={kind:'stack'|'equipment';templateRef:{id:string;version:number};quantity:number;quality:EquipmentEntity['quality'];itemLevel:number;binding:EquipmentEntity['binding'];equipment?:{slotKind:EquipmentEntity['slotKind'];affixes:EquipmentEntity['rolledAffixes'];setRef:EquipmentEntity['setRef'];durability:EquipmentEntity['durability']}};
/** Separate, explicit test authorization. Existing no-rewards combat profiles never authorize assets themselves. */
export type DropConfig={profile:'local-test-drops';ref:string;authorization:'isolated-local-assets-only';candidates:DropCandidate[];holdingsDomain?:BankHoldingsDomain};
export type GroundDrop=DropCandidate&{dropId:string;sourceKey:string;ordinal:number;sourceId:string;x:number;y:number;collected:boolean;collectedAt?:number;itemId?:string;deliveryRef?:string};
export type DropRoom={schemaVersion:number;id:string;accountId:string;challengeId:string;roomNo:number;attemptId:string;sceneEpoch:number;version?:number;dropConfigRef?:string;dropConfigHash?:string;drops?:GroundDrop[]};
export function validateDropConfig(c:DropConfig){
 if(c.profile!=='local-test-drops'||c.authorization!=='isolated-local-assets-only'||typeof c.ref!=='string'||!c.ref.length||c.ref.length>64||!Array.isArray(c.candidates)||c.candidates.length<1||c.candidates.length>32)throw new TypeError('CONFIG_NOT_READY');
 for(const d of c.candidates){if(!['stack','equipment'].includes(d.kind)||!d.templateRef||typeof d.templateRef.id!=='string'||!d.templateRef.id.length||d.templateRef.id.length>128||!Number.isSafeInteger(d.templateRef.version)||d.templateRef.version<1||!Number.isSafeInteger(d.quantity)||d.quantity<1||d.quantity>20||!['white','green','blue','purple','orange'].includes(d.quality)||!Number.isSafeInteger(d.itemLevel)||d.itemLevel<1||d.itemLevel>30||!d.binding||!['none','character','account'].includes(d.binding.kind)||d.kind==='equipment'&&(d.quantity!==1||!d.equipment))throw new TypeError('CONFIG_NOT_READY');}
 for(const d of c.candidates){
  if(![10,15,20,25,30].includes(d.itemLevel)||Object.keys(d).some(k=>!['kind','templateRef','quantity','quality','itemLevel','binding','equipment'].includes(k))||Object.keys(d.binding).some(k=>k!=='kind')||/[\s\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(d.templateRef.id))throw new TypeError('CONFIG_NOT_READY');
  if(d.kind==='equipment')toEquipmentView({schemaVersion:2,id:'validation-item',accountId:'validation-account',sourceKey:'validation-source',sourceOrdinal:0,sourceLocator:{kind:'roomDrop',roomId:'validation-room',dropId:'validation-drop'},templateRef:d.templateRef,slotKind:d.equipment!.slotKind,itemLevel:d.itemLevel,quality:d.quality,rolledAffixes:d.equipment!.affixes,setRef:d.equipment!.setRef,binding:d.binding.kind==='character'?{kind:'character',characterId:'validation-character'}:{kind:d.binding.kind},enhancementLevel:0,durability:d.equipment!.durability,location:{kind:'container',containerId:'validation-bag'},lifecycle:'active',version:1,createdAt:0,updatedAt:0});
 }
 return c;
}
export async function generateGroundDrops(room:DropRoom,h:EntryChallenge,kills:{spawnId:string}[],enemies:{actor:{actorId:string;x:number;y:number}}[],config:DropConfig):Promise<DropRoom>{
 validateDropConfig(config);const configHash=await dropConfigHash(config);if(room.dropConfigRef&&(room.dropConfigRef!==config.ref||room.dropConfigHash!==configHash))throw new TypeError('CONFIG_NOT_READY');
 const drops=structuredClone(room.drops??[]);
 for(const kill of kills){if(drops.some(d=>d.sourceId===kill.spawnId))continue;
 const sourceKey=await loginKey('dropSource',[h.id,h.currentRoomNo,kill.spawnId]);
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sourceKey+':'+config.ref)));
 const candidate=config.candidates[new DataView(bytes.buffer).getUint32(0,false)%config.candidates.length],actor=enemies.find(e=>e.actor.actorId===kill.spawnId)?.actor;
 if(!actor)throw new TypeError('CONFIG_NOT_READY');
 drops.push({...structuredClone(candidate),dropId:await loginKey('drop',[sourceKey,0]),sourceKey,ordinal:0,sourceId:kill.spawnId,x:actor.x,y:actor.y,collected:false});
 }
 if(drops.length>16)throw new TypeError('CONFIG_NOT_READY');
 return {...room,version:(room.version??0)+1,dropConfigRef:config.ref,dropConfigHash:configHash,drops};
}

/** Whole-source all-or-nothing delivery, preferring existing matching stacks. */
export async function planGroundDelivery(bag:import('../character/character-model.ts').ContainerEntity,drop:GroundDrop,accountId:string,characterId:string,journalId:string,now:number,roomId:string){
 validateGroundBag(bag);
 const slots=structuredClone(bag.slots),binding=drop.binding.kind==='character'?{kind:'character' as const,characterId,accountId}:drop.binding.kind==='account'?{kind:'account' as const,accountId}:{kind:'none' as const};
 if(!Number.isSafeInteger(bag.capacity)||bag.capacity<20||bag.capacity>100||Object.entries(slots).some(([key,s])=>!/^\d+$/.test(key)||Number(key)>=bag.capacity||Number(key)<0||s.kind==='stack'&&(!Number.isSafeInteger(s.quantity)||s.quantity<1||s.quantity>20)))throw new TypeError('CONFIG_NOT_READY');
 const free=()=>Array.from({length:bag.capacity},(_,i)=>i).find(i=>slots[i]===undefined);
 const inputs:unknown[]=[{kind:'roomDrop',sourceKey:drop.sourceKey,sourceId:drop.sourceId,ordinal:drop.ordinal,quantity:drop.quantity}],outputs:unknown[]=[];
 let item:EquipmentEntity|undefined;
 if(drop.kind==='equipment'){
 const index=free();if(index===undefined)throw new Error('BAG_FULL');
 if(!drop.equipment)throw new TypeError('CONFIG_NOT_READY');
 const id=await loginKey('equipment',[drop.sourceKey,drop.ordinal]);
 item={schemaVersion:2,id,accountId,holderCharacterId:characterId,sourceKey:drop.sourceKey,sourceOrdinal:drop.ordinal,sourceLocator:{kind:'roomDrop',roomId,dropId:drop.dropId},templateRef:drop.templateRef,slotKind:drop.equipment.slotKind,itemLevel:drop.itemLevel,quality:drop.quality,rolledAffixes:drop.equipment.affixes,setRef:drop.equipment.setRef,binding,enhancementLevel:0,durability:drop.equipment.durability,location:{kind:'container',containerId:bag.id},lifecycle:'active',version:1,createdAt:now,updatedAt:now};
 slots[index]={kind:'equipment',itemId:id,sortHeader:{itemLevel:item.itemLevel,quality:item.quality,slotKind:item.slotKind}};
 outputs.push({kind:'equipment',itemId:id,quantity:1});
 }else{
 let remaining=drop.quantity,ordinal=0;
 for(const [index,s]of Object.entries(slots).sort(([a],[b])=>Number(a)-Number(b))){
 if(s.kind!=='stack'||s.templateRef.id!==drop.templateRef.id||s.templateRef.version!==drop.templateRef.version||(s.binding.kind!==binding.kind||s.binding.kind==='character'&&s.binding.characterId!==characterId||s.binding.kind==='account'&&s.binding.accountId!==accountId)||s.quantity===20)continue;
 const amount=Math.min(20-s.quantity,remaining);inputs.push({kind:'stack',stackId:s.stackId,traceRef:s.traceRef,quantity:s.quantity});
 const next={...s,quantity:s.quantity+amount,traceRef:journalId+':'+ordinal++};slots[Number(index)]=next;outputs.push({kind:'stack',stackId:next.stackId,quantity:next.quantity,traceRef:next.traceRef});remaining-=amount;if(!remaining)break;
 }
 if(remaining){const index=free();if(index===undefined)throw new Error('BAG_FULL');const stackId=await loginKey('dropStack',[drop.sourceKey,drop.ordinal]),traceRef=journalId+':'+ordinal;
 slots[index]={kind:'stack',stackId,templateRef:drop.templateRef,quantity:remaining,binding,traceRef};outputs.push({kind:'stack',stackId,quantity:remaining,traceRef});}
 }
 return {bag:{...bag,slots,version:bag.version+1,updatedAt:now},item,lineage:{inputs,outputs}};
}

export async function groundHoldings(tx:import('../ports/store.ts').Transaction,a:{id:string},c:{id:string;classId:string},item:EquipmentEntity,config:DropConfig):Promise<Array<[string,unknown]>>{
 if(!item.setRef)return [];
 const domain=config.holdingsDomain;
 if(!domain||domain.keys.length>64||new Set(domain.keys.map(k=>k.collectionKey)).size!==domain.keys.length)throw new TypeError('CONFIG_NOT_READY');
 const matches=domain.keys.filter(k=>k.setId===item.setRef!.id&&k.setVersion===item.setRef!.version&&k.itemLevel===item.itemLevel&&k.slotId===item.slotKind);
 if(!matches.length)throw new TypeError('CONFIG_NOT_READY');const applicable=matches.filter(k=>k.classId===c.classId);if(!applicable.length)return [];
 const id=await loginKey('holdings',[a.id,'character',c.id]);
 const h=await tx.get<{schemaVersion:number;id:string;accountId:string;scope:string;characterId:string;revision:number;domainRef:string;entries:{collectionKey:string;permanentCount:number;mailLatestExpiryAt:number|null}[]}>(id);
 if(!h||h.schemaVersion!==2||h.id!==id||h.accountId!==a.id||h.scope!=='character'||h.characterId!==c.id||h.domainRef!==domain.ref||!Number.isSafeInteger(h.revision)||!Number.isSafeInteger(h.revision+1)||h.entries.length>64||new Set(h.entries.map(e=>e.collectionKey)).size!==h.entries.length||h.entries.some(e=>!domain.keys.some(k=>k.collectionKey===e.collectionKey)||!Number.isSafeInteger(e.permanentCount)||e.permanentCount<0))throw new TypeError('CONFIG_NOT_READY');
 parseHoldingsView({scope:'character',characterId:c.id,revision:h.revision,domainRef:h.domainRef,entries:h.entries});
 const entries=structuredClone(h.entries);for(const key of applicable){let e=entries.find(e=>e.collectionKey===key.collectionKey);if(!e){e={collectionKey:key.collectionKey,permanentCount:0,mailLatestExpiryAt:null};entries.push(e);}if(!Number.isSafeInteger(e.permanentCount+1))throw new TypeError('CONFIG_NOT_READY');e.permanentCount++;}
 const next={...h,revision:h.revision+1,entries};if(entries.length>64||new TextEncoder().encode(JSON.stringify(next)).length>16384)throw new TypeError('CONFIG_NOT_READY');return [[id,next]];
}


export async function dropConfigHash(config:DropConfig){return manifestDigest({profile:config.profile,authorization:config.authorization,ref:config.ref,candidates:config.candidates});}
export async function verifyFixedDrop(drop:GroundDrop,room:DropRoom,config:DropConfig){
 if(room.dropConfigHash!==await dropConfigHash(config))throw new TypeError('CONFIG_NOT_READY');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(drop.sourceKey+':'+config.ref)));
 const candidate=config.candidates[new DataView(bytes.buffer).getUint32(0,false)%config.candidates.length];
 const projected=Object.fromEntries(Object.keys(candidate).map(key=>[key,(drop as unknown as Record<string,unknown>)[key]]));
 if(canonical(projected)!==canonical(candidate))throw new TypeError('CONFIG_NOT_READY');
}
export function validateGroundBag(bag:import('../character/character-model.ts').ContainerEntity){
 parseContainerView({containerId:bag.id,version:bag.version,kind:'backpack',owner:{kind:'character',characterId:bag.characterId},capacity:bag.capacity,unlockStage:bag.stage,slots:Object.entries(bag.slots).map(([index,e])=>({index:Number(index),entry:e.kind==='equipment'?e:{...e,templateRef:e.templateRef.id,binding:e.binding.kind==='character'?{kind:'character',characterId:e.binding.characterId}:{kind:e.binding.kind}}}))});
 for(const s of Object.values(bag.slots))if(s.kind==='stack'&&(!Number.isSafeInteger(s.templateRef.version)||s.templateRef.version<1||s.binding.kind==='character'&&(s.binding.characterId!==bag.characterId||s.binding.accountId!==undefined&&s.binding.accountId!==bag.accountId)||s.binding.kind==='account'&&s.binding.accountId!==bag.accountId))throw new TypeError('CONFIG_NOT_READY');
}
