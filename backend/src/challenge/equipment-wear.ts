import type {ChallengeContent} from './challenge-model.ts';
import type {EquipmentEntity} from '../character/character-model.ts';
import {WEARABLE_SLOTS,aggregateCombatAttributes} from '../equipment/equipment-rules.ts';
import type {SetBonusConfig} from '../equipment/equipment-model.ts';

/** Asset wear is opt-in in isolated local fixtures, independently of economic rewards.
 * Existing reward-enabled fixtures retain the fixed approved 1/5 policy. */
export function wearPolicy(content:ChallengeContent){
 const explicit=content.wear,rewards=content.rewards;
 if(!explicit&&!rewards)return null;
 if(content.profile!=='local-test'||content.purpose!=='contract-fixture-only')throw new TypeError('CONFIG_NOT_READY');
 if(rewards&&(rewards.profile!=='local-test-kill-rewards'||rewards.authorization!=='isolated-local-assets-only'||rewards.roomWear!==1))throw new TypeError('CONFIG_NOT_READY');
 if(explicit){
  if(Object.keys(explicit).length!==5||explicit.profile!=='local-test-wear'||explicit.authorization!=='isolated-local-assets-only'||!/^[A-Za-z0-9_-]{1,64}$/.test(explicit.ref)||explicit.roomWear!==1||explicit.deathWear!==5)throw new TypeError('CONFIG_NOT_READY');
  return explicit;
 }
 return {profile:'local-test-wear' as const,authorization:'isolated-local-assets-only' as const,ref:'legacy-rewards-wear-v1',roomWear:1,deathWear:5};
}

export function applyEquipmentWear(items:EquipmentEntity[],amount:number,now:number){
 return items.map(item=>{
  if(!amount||!WEARABLE_SLOTS.includes(item.slotKind)||!item.durability.wearEnabled)return item;
  const {current,max}=item.durability;
  if(current===null||max===null||!Number.isSafeInteger(current)||!Number.isSafeInteger(max)||current<0||current>max)throw new TypeError('CONFIG_NOT_READY');
  const next=Math.max(0,current-amount);
  if(next===current)return item;
  if(!Number.isSafeInteger(item.version)||item.version<0||!Number.isSafeInteger(item.version+1))throw new TypeError('CONFIG_NOT_READY');
  return {...item,durability:{...item.durability,current:next},version:item.version+1,updatedAt:now};
 });
}

export function wearChangesAttributes(before:EquipmentEntity[],after:EquipmentEntity[],sets?:Record<string,SetBonusConfig>){
 const attributes=(items:EquipmentEntity[])=>JSON.stringify(aggregateCombatAttributes(Object.fromEntries(items.map(i=>[i.slotKind,i])),sets));
 return attributes(before)!==attributes(after);
}
