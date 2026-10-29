import {loginKey} from '../identity/identity-v2.ts';
import {validateDropConfig,validateGroundBag,groundHoldings} from './ground-drops.ts';
import type {DropCandidate,DropConfig} from './ground-drops.ts';
import type {CharacterEntity,ContainerEntity,EquipmentEntity,MailEntity,RewardGrantEntity} from '../character/character-model.ts';
import type {Transaction} from '../ports/store.ts';
import {toEquipmentView} from '../equipment/equipment-service.ts';
import {parseHoldingsView} from '../../../shared/src/protocol/asset-v2.ts';
import type {BankHoldingsDomain} from '../bank/bank-service.ts';
export type TerminalConfig={profile:'local-test-terminal';authorization:'isolated-local-assets-only';ref:string;gold:string;xp:number;progressionRef:{id:string;version:number};thresholds:number[];attributes:{maxHp:string;maxMp:string}[];equipment:DropCandidate[];missingPolicy:'random'|'missing-first';holdingsDomain?:BankHoldingsDomain;levelWeapons:{node:number;itemLevel:number;templateRef:{id:string;version:number}}[]};
function check(ok:unknown):asserts ok{if(!ok)throw new TypeError('CONFIG_NOT_READY');}
export function validateTerminal(config:TerminalConfig){
 check(Object.keys(config).every(k=>['profile','authorization','ref','gold','xp','progressionRef','thresholds','attributes','equipment','missingPolicy','holdingsDomain','levelWeapons'].includes(k)));
 check(config.profile==='local-test-terminal'&&config.authorization==='isolated-local-assets-only'&&/^[A-Za-z0-9_-]{1,64}$/.test(config.ref)&&/^(0|[1-9][0-9]{0,11})$/.test(config.gold)&&Number.isSafeInteger(config.xp)&&config.xp>=0);
 check(config.thresholds.length===30&&config.thresholds[0]===0&&config.thresholds.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&(!i||v>config.thresholds[i-1])));
 check(config.attributes.length===30&&config.attributes.every(a=>Object.keys(a).length===2&&[a.maxHp,a.maxMp].every(n=>typeof n==='string'&&/^[1-9][0-9]{0,11}$/.test(n))));
 check(config.progressionRef&&typeof config.progressionRef.id==='string'&&config.progressionRef.id.length<=128&&Number.isSafeInteger(config.progressionRef.version)&&config.progressionRef.version>0);
 check(['random','missing-first'].includes(config.missingPolicy)&&config.levelWeapons.length===6&&config.levelWeapons.every((w,i)=>w.node===(i+1)*5&&[10,15,20,25,30].includes(w.itemLevel)&&w.templateRef.id.length>0&&w.templateRef.id.length<=128&&Number.isSafeInteger(w.templateRef.version)&&w.templateRef.version>0));
 validateDropConfig({profile:'local-test-drops',authorization:config.authorization,ref:config.ref,candidates:config.equipment});check(config.equipment.every(e=>e.kind==='equipment'));
 if(config.equipment.some(e=>e.equipment!.setRef)){const d=config.holdingsDomain;check(d&&d.keys.length>0&&d.keys.length<=64&&new Set(d.keys.map(k=>k.collectionKey)).size===d.keys.length&&d.ref.length>0&&d.ref.length<=128);for(const k of d.keys)check(typeof k.collectionKey==='string'&&k.collectionKey.length>0&&k.collectionKey.length<=128&&typeof k.setId==='string'&&k.setId.length>0&&Number.isSafeInteger(k.setVersion)&&k.setVersion>0&&[10,15,20,25,30].includes(k.itemLevel)&&['warrior','hunter'].includes(k.classId));}
 return config;
}
export async function advanceProgression(tx:Transaction,c:CharacterEntity,config:TerminalConfig,now:number){
 validateTerminal(config);check(c.progressionConfigRef.id===config.progressionRef.id&&c.progressionConfigRef.version===config.progressionRef.version&&Number.isSafeInteger(c.xp)&&c.xp>=config.thresholds[c.level-1]);
 const level=config.thresholds.filter(x=>x<=c.xp).length;check(level>=c.level&&c.statsVersion<Number.MAX_SAFE_INTEGER);
 const mailIds=[...(c.mailIds??[])],created:string[]=[];
 for(const node of config.levelWeapons.filter(w=>w.node>c.level&&w.node<=level)){
  const id=`mail:${c.id}:level-${node.node}`,old=await tx.get<MailEntity>(id);
  if(old){check(old.accountId===c.accountId&&old.characterId===c.id&&old.sourceKey===id);continue;}
  const mail:MailEntity={schemaVersion:2,id,accountId:c.accountId,characterId:c.id,sourceKey:id,titleKey:'mail.level.title',bodyKey:'mail.level.body',parameters:{level:node.node},expiresAt:now+30*86400000,status:'active',readAt:null,version:0,attachments:[{attachmentId:'weapon',kind:'equipment',templateRef:node.templateRef,quantityGranted:1,quantityClaimed:0,binding:{kind:'character',accountId:c.accountId,characterId:c.id},state:'available',equipmentPayload:{itemLevel:node.itemLevel,quality:'green',slotKind:'weapon',enhancementLevel:0,affixes:[]}}],createdAt:now,updatedAt:now};
  check(new TextEncoder().encode(JSON.stringify(mail)).length<=8192);tx.set(id,mail);if(!mailIds.includes(id))mailIds.push(id);created.push(id);
 }
 return {character:{...c,level,statsVersion:c.statsVersion+(level!==c.level?1:0),mailIds},created};
}
export async function planClear(tx:Transaction,c:CharacterEntity,bag:ContainerEntity,challengeId:string,config:TerminalConfig,now:number,source:{kind:string;monsterLevel:number}){
 validateTerminal(config);validateGroundBag(bag);const sourceKey=await loginKey('clearSource',[challengeId]),itemId=await loginKey('equipment',[challengeId,'clear-equipment']),grantId=await loginKey('clearGrant',[challengeId,0]);
 check(await tx.get(itemId)===undefined);const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sourceKey+':'+config.ref))),sample=new DataView(digest.buffer).getUint32(0,false);let d=config.equipment[sample%config.equipment.length];
 let candidates=config.equipment.filter(e=>e.equipment!.setRef?.id===d.equipment!.setRef?.id&&e.equipment!.setRef?.version===d.equipment!.setRef?.version&&e.itemLevel===d.itemLevel&&e.quality===d.quality);
 if(d.equipment!.setRef){
  check(source.kind==='special'&&source.monsterLevel===30&&c.level===30&&d.itemLevel===30);
  const domain=config.holdingsDomain;check(domain);
  const summaries:ReturnType<typeof parseHoldingsView>[]=[];
  for(const scope of ['character','account'] as const){const id=await loginKey('holdings',scope==='character'?[c.accountId,scope,c.id]:[c.accountId,scope]);const h=await tx.get<any>(id);check(h&&h.schemaVersion===2&&h.id===id&&h.accountId===c.accountId&&h.scope===scope&&(scope!=='character'||h.characterId===c.id)&&h.domainRef===domain.ref);parseHoldingsView({scope,...scope==='character'?{characterId:c.id}:{},revision:h.revision,domainRef:h.domainRef,entries:h.entries});check(h.entries.every((e:any)=>domain.keys.some(k=>k.collectionKey===e.collectionKey)));summaries.push(h);}
  if(config.missingPolicy==='missing-first'){const missing=candidates.filter(e=>{const keys=domain.keys.filter(k=>k.setId===e.equipment!.setRef?.id&&k.setVersion===e.equipment!.setRef?.version&&k.slotId===e.equipment!.slotKind&&k.itemLevel===e.itemLevel&&k.classId===c.classId);check(keys.length);return keys.every(k=>summaries.every((s,i)=>{const a=s.entries.find((a:any)=>a.collectionKey===k.collectionKey);return !a||a.permanentCount===0&&(i===1||a.mailLatestExpiryAt===null||a.mailLatestExpiryAt<=now);}));});if(missing.length)candidates=missing;}
 }
 if(d.equipment!.setRef)d=candidates[sample%candidates.length];
 const free=Array.from({length:bag.capacity},(_,i)=>i).find(i=>bag.slots[i]===undefined),route=free===undefined?'pending' as const:'direct' as const;
 const item:EquipmentEntity={schemaVersion:2,id:itemId,accountId:c.accountId,holderCharacterId:c.id,sourceKey,sourceOrdinal:0,sourceLocator:{kind:'challengeClear',challengeId,ordinal:0},templateRef:d.templateRef,slotKind:d.equipment!.slotKind,itemLevel:d.itemLevel,quality:d.quality,rolledAffixes:structuredClone(d.equipment!.affixes),setRef:d.equipment!.setRef,binding:d.binding.kind==='character'?{kind:'character',accountId:c.accountId,characterId:c.id}:d.binding.kind==='account'?{kind:'account',accountId:c.accountId}:{kind:'none'},enhancementLevel:0,durability:structuredClone(d.equipment!.durability),location:route==='direct'?{kind:'container',containerId:bag.id}:{kind:'pending',grantId},lifecycle:'active',version:1,createdAt:now,updatedAt:now};
 const equipment=toEquipmentView(item);check(new TextEncoder().encode(JSON.stringify(item)).length<=4096);tx.set(itemId,item);
 const nextC={...c,pendingGrantIds:[...(c.pendingGrantIds??[])]};let nextBag=bag;
 if(route==='direct'){nextBag={...bag,version:bag.version+1,updatedAt:now,slots:{...bag.slots,[free!]:{kind:'equipment',itemId,sortHeader:{itemLevel:item.itemLevel,quality:item.quality,slotKind:item.slotKind}}}};tx.set(bag.id,nextBag);}
 else{check(await tx.get(grantId)===undefined);const grant:RewardGrantEntity={schemaVersion:2,id:grantId,accountId:c.accountId,characterId:c.id,sourceType:'challengeClear',sourceTuple:sourceKey,route:'pending',payload:{kind:'equipment',itemId},deliveryState:'available',createdAt:now,deliveredAt:null,version:0};tx.set(grantId,grant);nextC.pendingGrantIds.push(grantId);}
 const dc:DropConfig={profile:'local-test-drops',authorization:config.authorization,ref:config.ref,candidates:config.equipment,holdingsDomain:config.holdingsDomain};for(const [id,value]of await groundHoldings(tx,{id:c.accountId},c,item,dc))tx.set(id,value);
 return {character:nextC,bag:nextBag,sourceKey,itemId,grantId:route==='pending'?grantId:null,route,equipment};
}
