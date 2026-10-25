import {validateCrossConfig} from '../../../shared/src/cross-combat-kernel.ts';
import type {CrossConfig} from '../../../shared/src/cross-combat-kernel.ts';
import {validateCombatConfig,validateCombatStats} from '../../../shared/src/basic-combat-kernel.ts';
import type {CombatConfig,CombatStats,Rational,CombatTarget} from '../../../shared/src/basic-combat-kernel.ts';
import type {ChallengeContent} from './challenge-model.ts';
import type {CharacterEntity,EquipmentEntity} from '../character/character-model.ts';
import {aggregateCombatAttributes} from '../equipment/equipment-rules.ts';
import type {SetBonusConfig} from '../equipment/equipment-model.ts';
export type BasicTrainingProfile={schemaVersion:1|2;profile:'local-test-basic'|'local-test-cross';capabilities:['basic','no-rewards']|['basic','cross','no-rewards'];cross?:CrossConfig;mastery?:Rational;config:CombatConfig;attributes:{attackPowerByLevel:string[];haste:Rational;damageBonus:Rational;hit:Rational;crit:Rational;critMultiplier:Rational};targets:Record<string,{mitigation:Rational;evasion:Rational;damageImmune:boolean}>};
function check(v:unknown):asserts v{if(!v)throw new TypeError('CONFIG_NOT_READY');}
function fields(v:unknown,keys:string[]):asserts v is Record<string,unknown>{check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));}
function rational(v:unknown,prob=false){fields(v,['n','d']);check(typeof v.n==='string'&&/^(0|[1-9][0-9]{0,9})$/.test(v.n)&&typeof v.d==='string'&&/^[1-9][0-9]{0,9}$/.test(v.d)&&BigInt(v.n)<=4294967295n&&BigInt(v.d)<=4294967295n&&(!prob||BigInt(v.n)<=BigInt(v.d)));}
export function validateBasicTraining(value:unknown):BasicTrainingProfile{
 const cross=(value as {schemaVersion?:number})?.schemaVersion===2;fields(value,['schemaVersion','profile','capabilities','config','attributes','targets',...cross?['cross','mastery']:[]]);check(cross?value.profile==='local-test-cross'&&JSON.stringify(value.capabilities)==='["basic","cross","no-rewards"]':value.schemaVersion===1&&value.profile==='local-test-basic'&&JSON.stringify(value.capabilities)==='["basic","no-rewards"]');validateCombatConfig(value.config);if(cross){const cfg=validateCrossConfig(value.cross);rational(value.mastery);const maxCasts=Math.ceil((cfg.durationUs+cfg.projectileDurationUs+cfg.bleed.jumps*cfg.bleed.intervalUs)*8/cfg.cooldownUs)+2;check(maxCasts*17<=2048);}
 fields(value.attributes,['attackPowerByLevel','haste','damageBonus','hit','crit','critMultiplier']);check(Array.isArray(value.attributes.attackPowerByLevel)&&value.attributes.attackPowerByLevel.length===30);for(const n of value.attributes.attackPowerByLevel)check(typeof n==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(n)&&BigInt(n)<=18446744073709551615n);for(const k of ['haste','damageBonus','hit','crit','critMultiplier'])rational(value.attributes[k],k==='hit'||k==='crit');
 check(value.targets&&typeof value.targets==='object'&&!Array.isArray(value.targets)&&Object.keys(value.targets).length>=1&&Object.keys(value.targets).length<=32);for(const [ref,t] of Object.entries(value.targets)){check(ref.length<=64);fields(t,['mitigation','evasion','damageImmune']);rational(t.mitigation,true);rational(t.evasion,true);check(typeof t.damageImmune==='boolean');}const typed=value as BasicTrainingProfile;for(const attackPower of typed.attributes.attackPowerByLevel)validateCombatStats({attackPower,haste:typed.attributes.haste,damageBonus:typed.attributes.damageBonus,hit:typed.attributes.hit,crit:typed.attributes.crit,critMultiplier:typed.attributes.critMultiplier,x:0,y:0,facing:1});return structuredClone(value) as BasicTrainingProfile;
}
function add(a:Rational,b:string):Rational{let n=BigInt(a.n)*1000n+BigInt(b)*BigInt(a.d),d=BigInt(a.d)*1000n,x=n,y=d;while(y){const t=x%y;x=y;y=t;}n/=x||1n;d/=x||1n;return {n:String(n),d:String(d)};}
function capped(a:Rational,max:bigint):Rational{return BigInt(a.n)>max*BigInt(a.d)?{n:String(max),d:'1'}:a;}
/** Current character/equipment authority. Entry audit snapshots never participate. Stats are internal units; rates use thousandths. */
export function currentBasicStats(c:CharacterEntity,items:EquipmentEntity[],profile:BasicTrainingProfile,position:{x:number;y:number;facing:1|-1},sets?:Record<string,SetBonusConfig>):CombatStats{
 const values=new Map(aggregateCombatAttributes(Object.fromEntries(items.map(i=>[i.slotKind,i])),sets).map(a=>[a.statId,a.value]));
 check(c.level>=1&&c.level<=30);const a=profile.attributes;
 return {attackPower:String(BigInt(a.attackPowerByLevel[c.level-1])+BigInt(values.get('attackPower')??'0')),haste:capped(add(a.haste,values.get('haste')??'0'),2n),damageBonus:add(a.damageBonus,values.get('damageBonus')??'0'),hit:capped(add(a.hit,values.get('hit')??'0'),1n),crit:capped(add(a.crit,values.get('crit')??'0'),1n),critMultiplier:add(a.critMultiplier,values.get('critMultiplier')??'0'),...position};
}
export function trainingCapability(content:ChallengeContent){if(content.combat!==undefined){check(content.profile==='local-test'&&content.purpose==='contract-fixture-only');return validateBasicTraining(content.combat);}return null;}
/** Server-private stream indexed only by committed scene seed/cursor; no operation/request entropy. */
export async function combatRandomTape(seed:string,from:number,count:number):Promise<number[]>{
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(seed.match(/../g)!,s=>parseInt(s,16)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Promise.all(Array.from({length:count},async(_,i)=>{const result=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`combat-v1:${from+i}`)));return new DataView(result.buffer).getUint32(0,false);}));
}
/** Bulk server-private indexed stream for multi-node effects. Domain and absolute cursor bind slicing, never request IDs. */
export async function crossRandomTape(seed:string,from:number,count:number):Promise<number[]>{
 const key=await crypto.subtle.importKey('raw',Uint8Array.from(seed.match(/../g)!,s=>parseInt(s,16)),{name:'AES-CTR'},false,['encrypt']);
 const counter=new Uint8Array(16);counter.set(new TextEncoder().encode('cross-v1'));new DataView(counter.buffer).setBigUint64(8,BigInt(Math.floor(from/4)),false);
 const skip=from%4,bytes=await crypto.subtle.encrypt({name:'AES-CTR',counter,length:64},key,new Uint8Array((count+skip)*4)),view=new DataView(bytes);
 return Array.from({length:count},(_,i)=>view.getUint32((i+skip)*4,false));
}
export function currentSkillMastery(items:EquipmentEntity[],profile:BasicTrainingProfile,sets?:Record<string,SetBonusConfig>):Rational{
 check(profile.mastery);const value=aggregateCombatAttributes(Object.fromEntries(items.map(i=>[i.slotKind,i])),sets).find(a=>a.statId==='mastery')?.value??'0';return add(profile.mastery,value);
}
