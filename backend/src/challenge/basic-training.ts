import {validateMonsterConfig} from '../../../shared/src/monster-simulation.ts';
import type {MonsterConfig} from '../../../shared/src/monster-simulation.ts';
import {validateEarthConfig} from '../../../shared/src/earth-combat-kernel.ts';
import type {EarthConfig} from '../../../shared/src/earth-combat-kernel.ts';
import {validateBadaoConfig} from '../../../shared/src/badao-combat-kernel.ts';
import type {BadaoConfig} from '../../../shared/src/badao-combat-kernel.ts';
import {validateBengshanConfig} from '../../../shared/src/bengshan-combat-kernel.ts';
import type {BengshanConfig} from '../../../shared/src/bengshan-combat-kernel.ts';
import {validateCrossConfig} from '../../../shared/src/cross-combat-kernel.ts';
import type {CrossConfig} from '../../../shared/src/cross-combat-kernel.ts';
import {validateCombatConfig,validateCombatStats} from '../../../shared/src/basic-combat-kernel.ts';
import type {CombatConfig,CombatStats,Rational,CombatTarget} from '../../../shared/src/basic-combat-kernel.ts';
import type {ChallengeContent} from './challenge-model.ts';
import type {CharacterEntity,EquipmentEntity} from '../character/character-model.ts';
import {aggregateCombatAttributes} from '../equipment/equipment-rules.ts';
import type {SetBonusConfig} from '../equipment/equipment-model.ts';
export type BasicTrainingProfile={schemaVersion:1|2|3|4|5|6;monsters?:MonsterConfig;profile:'local-test-basic'|'local-test-cross'|'local-test-bengshan'|'local-test-badao'|'local-test-earth'|'local-test-monsters';capabilities:['basic','cross','bengshan','badao','earth','monsters','no-rewards']|['basic','no-rewards']|['basic','cross','no-rewards']|['basic','cross','bengshan','no-rewards']|['basic','cross','bengshan','badao','no-rewards']|['basic','cross','bengshan','badao','earth','no-rewards'];earth?:EarthConfig;badao?:BadaoConfig;cross?:CrossConfig;bengshan?:BengshanConfig;mastery?:Rational;config:CombatConfig;attributes:{attackPowerByLevel:string[];haste:Rational;damageBonus:Rational;hit:Rational;crit:Rational;critMultiplier:Rational};targets:Record<string,{mitigation:Rational;evasion:Rational;damageImmune:boolean}>};
function check(v:unknown):asserts v{if(!v)throw new TypeError('CONFIG_NOT_READY');}
function fields(v:unknown,keys:string[]):asserts v is Record<string,unknown>{check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));}
function rational(v:unknown,prob=false){fields(v,['n','d']);check(typeof v.n==='string'&&/^(0|[1-9][0-9]{0,9})$/.test(v.n)&&typeof v.d==='string'&&/^[1-9][0-9]{0,9}$/.test(v.d)&&BigInt(v.n)<=4294967295n&&BigInt(v.d)<=4294967295n&&(!prob||BigInt(v.n)<=BigInt(v.d)));}
export function validateBasicTraining(value:unknown):BasicTrainingProfile{
 const version=(value as {schemaVersion?:number})?.schemaVersion,cross=version===2||version===3||version===4||(version===5||version===6),bengshan=version===3||version===4||(version===5||version===6),badao=version===4||(version===5||version===6),earth=(version===5||version===6);fields(value,['schemaVersion','profile','capabilities','config','attributes','targets',...cross?['cross','mastery']:[],...bengshan?['bengshan']:[],...badao?['badao']:[],...earth?['earth']:[],...version===6?['monsters']:[]]);if(version===6)validateMonsterConfig(value.monsters);check(version===6?value.profile==='local-test-monsters'&&JSON.stringify(value.capabilities)==='["basic","cross","bengshan","badao","earth","monsters","no-rewards"]':earth?value.profile==='local-test-earth'&&JSON.stringify(value.capabilities)==='["basic","cross","bengshan","badao","earth","no-rewards"]':badao?value.profile==='local-test-badao'&&JSON.stringify(value.capabilities)==='["basic","cross","bengshan","badao","no-rewards"]':bengshan?value.profile==='local-test-bengshan'&&JSON.stringify(value.capabilities)==='["basic","cross","bengshan","no-rewards"]':cross?value.profile==='local-test-cross'&&JSON.stringify(value.capabilities)==='["basic","cross","no-rewards"]':value.schemaVersion===1&&value.profile==='local-test-basic'&&JSON.stringify(value.capabilities)==='["basic","no-rewards"]');validateCombatConfig(value.config);if(cross){const cfg=validateCrossConfig(value.cross);rational(value.mastery);const maxCasts=Math.ceil((cfg.durationUs+cfg.projectileDurationUs+cfg.bleed.jumps*cfg.bleed.intervalUs)*8/cfg.cooldownUs)+2;check(maxCasts*17<=2048);}
 if(bengshan){const cfg=validateBengshanConfig(value.bengshan);check((Math.ceil((cfg.durationUs+cfg.bleed.jumps*cfg.bleed.intervalUs)*8/cfg.cooldownUs)+2)*24<=2048);}
 if(badao){const cfg=validateBadaoConfig(value.badao);check((Math.ceil((cfg.durationUs+cfg.bleed.jumps*cfg.bleed.intervalUs)*8/cfg.cooldownUs)+2)*8<=2048);}
 if(earth){validateEarthConfig(value.earth);validateMixedEnvelope(value as unknown as BasicTrainingProfile);}
 fields(value.attributes,['attackPowerByLevel','haste','damageBonus','hit','crit','critMultiplier']);check(Array.isArray(value.attributes.attackPowerByLevel)&&value.attributes.attackPowerByLevel.length===30);for(const n of value.attributes.attackPowerByLevel)check(typeof n==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(n)&&BigInt(n)<=18446744073709551615n);for(const k of ['haste','damageBonus','hit','crit','critMultiplier'])rational(value.attributes[k],k==='hit'||k==='crit');
 check(value.targets&&typeof value.targets==='object'&&!Array.isArray(value.targets)&&Object.keys(value.targets).length>=1&&Object.keys(value.targets).length<=32);for(const [ref,t] of Object.entries(value.targets)){check(ref.length<=64);fields(t,['mitigation','evasion','damageImmune']);rational(t.mitigation,true);rational(t.evasion,true);check(typeof t.damageImmune==='boolean');}const typed=value as BasicTrainingProfile;for(const attackPower of typed.attributes.attackPowerByLevel)validateCombatStats({attackPower,haste:typed.attributes.haste,damageBonus:typed.attributes.damageBonus,hit:typed.attributes.hit,crit:typed.attributes.crit,critMultiplier:typed.attributes.critMultiplier,x:0,y:0,facing:1});validateTrainingArithmetic(typed);return structuredClone(value) as BasicTrainingProfile;
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

/** Publication proof: every legal skill/basic start path observes the configured action end,
 * already divided by maximum haste2. Revive resets cooldowns, never action recovery. */
export function validateMixedEnvelope(p:BasicTrainingProfile){
 const skills=[p.cross!,p.bengshan!,p.badao!,p.earth!];const minimumHaste=p.attributes.haste;const within=(us:number,limit:number)=>BigInt(us)*BigInt(minimumHaste.d)<=BigInt(limit)*BigInt(minimumHaste.n);
 const minSkillGapUs=Math.min(...skills.map(c=>c.durationUs/2));
 const minBasicGapUs=Math.min(...p.config.stages.map(c=>c.durationUs/2));
 // Basic may cancel immediately into skill, but cannot begin while a skill recovers.
 // A basic->skill same-tick pair has only one effect-bearing skill start.
 check(minSkillGapUs>=120000&&minBasicGapUs>=120000);
 for(const c of skills){check(c.bleed.jumps<=5&&within(c.bleed.intervalUs*c.bleed.jumps,5000000));const nodes='nodeOffsetsUs'in c?c.nodeOffsetsUs:[c.nodeOffsetUs];check(within(nodes[nodes.length-1],4000000)&&within(c.durationUs,9000000)&&within(nodes[nodes.length-1]+c.bleed.intervalUs*c.bleed.jumps,9000000));if('projectileDurationUs'in c)check(within(c.nodeOffsetsUs[1]+c.projectileDurationUs,4000000)&&within(c.nodeOffsetsUs[1]+c.projectileDurationUs+c.bleed.intervalUs*c.bleed.jumps,9000000));}
 return {version:1,minimumGapUs:minSkillGapUs,tailUs:9000000,playerCasts:76,playerBleeds:2432,playerDetached:304,futureMonsterEffects:912,snapshots:228};
}

/** Publication proof over the entire supported post-equipment snapshot domain, not the
 * fixture's starting panel. CombatStats admits AP<=10^12, bonus/mastery<=10 and
 * critical multiplier<=10; every character level 1..30 is reachable in training. */
export function validateTrainingArithmetic(p:BasicTrainingProfile):void{
 const max=18446744073709551615n,ap=1000000000000n;
 const floorProduct=(n:bigint,c:Rational,multiplier:bigint)=>n*BigInt(c.n)*multiplier/BigInt(c.d);
 const bounded=(n:bigint)=>check(n<=max);
 // Basic has no mastery. Critical amplification occurs after the stage product.
 for(const stage of p.config.stages)bounded(floorProduct(ap,stage.coefficient,110n));
 const portions=(total:bigint,weights:number[])=>{const sum=BigInt(weights.reduce((a,b)=>a+b,0));const first=weights.slice(0,-1).map(w=>total*BigInt(w)/sum);return [...first,total-first.reduce((a,b)=>a+b,0n)];};
 for(const cfg of [p.cross,p.bengshan,p.badao,p.earth])if(cfg){
  const growth=BigInt(Math.floor((30-cfg.unlockLevel)/2))*BigInt(cfg.damage.growth);
  // Keep rational AP contribution until the complete direct budget is floored.
  const direct=((BigInt(cfg.damage.base)+growth)*BigInt(cfg.damage.coefficient.d)+ap*BigInt(cfg.damage.coefficient.n))*121n/BigInt(cfg.damage.coefficient.d);
  const weights='nodeWeights'in cfg.damage?cfg.damage.nodeWeights:[1];
  for(const node of portions(direct,weights))bounded(node*10n);
  const bleed=floorProduct(ap,cfg.bleed.coefficient,121n);bounded(bleed);
  const bleedWeights='nodeWeights'in cfg.bleed?cfg.bleed.nodeWeights:[1];
  for(const node of portions(bleed,bleedWeights)){
   const early=node/BigInt(cfg.bleed.jumps),last=node-early*BigInt(cfg.bleed.jumps-1);
   bounded(last*10n);
  }
 }
}

/** Current defensive authority; rates are thousandths, armor uses internal resource units. */
export function currentMonsterDefense(items:EquipmentEntity[],sets?:Record<string,SetBonusConfig>){const values=new Map(aggregateCombatAttributes(Object.fromEntries(items.map(i=>[i.slotKind,i])),sets).map(a=>[a.statId,a.value]));return {armor:values.get('armor')??'0',armorConstant:'100000',reduction:capped(add({n:'0',d:'1'},values.get('damageReduction')??'0'),1n)};}
