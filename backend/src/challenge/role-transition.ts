import {resource} from '../../../shared/src/exact-values.ts';
import {resolveTrinketTemplate} from '../../../shared/src/trinket-kernel.ts';
import type {ChallengeContent} from './challenge-model.ts';
import {parseRoleCheckpoint} from './room-checkpoint.ts';
import type {RoleCheckpoint} from './room-checkpoint.ts';
type Fraction={numerator:number;denominator:number};
function check(v:unknown):asserts v {if(!v)throw new TypeError('CONFIG_NOT_READY');}
function gcd(a:bigint,b:bigint):bigint {while(b){const t=a%b;a=b;b=t;}return a;}
function reduced(n:bigint,d:bigint):Fraction {if(n===0n)return {numerator:0,denominator:1};const g=gcd(n,d);n/=g;d/=g;check(d<=4294967295n&&n<=4294967295n);return {numerator:Number(n),denominator:Number(d)};}
function rate(v:Fraction):[bigint,bigint]{check(Number.isSafeInteger(v.numerator)&&v.numerator>=0&&v.numerator<=4294967295&&Number.isSafeInteger(v.denominator)&&v.denominator>=1&&v.denominator<=4294967295);return [BigInt(v.numerator),BigInt(v.denominator)];}
/** Exact resource units (1/1000 HP), seconds to milliseconds explicitly /1000. No tick flooring. */
export function advanceRole(role:RoleCheckpoint,fromMs:number,toMs:number,content:ChallengeContent):RoleCheckpoint {
 check(Number.isSafeInteger(fromMs)&&Number.isSafeInteger(toMs)&&toMs>=fromMs);const next=parseRoleCheckpoint(role),config=content.regeneration;
 if(next.regenerationRef!==null){check(next.schemaVersion>=2&&config&&config.profile==='local-test'&&config.unit==='internal-per-second'&&config.ref===next.regenerationRef&&config.buffs.length<=32);}
 for(const buff of next.buffs){const isRegen=config&&config.buffs.some(b=>b.templateRef===buff.templateRef);const isTrinket=resolveTrinketTemplate(buff.templateRef)!==null;check(isRegen||isTrinket);}
 const regenBuffs=config?next.buffs.filter(b=>config.buffs.some(cb=>cb.templateRef===b.templateRef)):[];
 if(regenBuffs.length){check(config&&next.regenerationRef===config.ref);}
 // Validate denominator closure before any resource mutation. All possible summed rates and persisted fractions fit uint32.
 if(config&&next.regenerationRef!==null){let closure=1n;for(const r of [config.hp,config.mp,...config.buffs.flatMap(b=>[b.hp,b.mp])]){const [n,secondsDenominator]=rate(r),raw=secondsDenominator*1000n,d=raw/gcd(n,raw);closure=closure/gcd(closure,d)*d;check(closure<=4294967295n);}for(const r of [next.hpRegenRemainder,next.mpRegenRemainder])check(closure/gcd(closure,BigInt(r.denominator))*BigInt(r.denominator)<=4294967295n);}
 let at=fromMs;next.buffs=next.buffs.filter(b=>BigInt(b.endsAtTick)*10n>BigInt(at));
 while(at<toMs){let end=toMs;for(const b of next.buffs){const deadline=BigInt(b.endsAtTick)*10n;if(deadline<BigInt(end))end=Number(deadline);}
  if(config&&next.regenerationRef!==null){for(const key of ['hp','mp'] as const){let [a,b]=rate(config[key]);for(const buff of regenBuffs.filter(b=>BigInt(b.endsAtTick)*10n>BigInt(at))){const spec=config.buffs.find(s=>s.templateRef===buff.templateRef);check(spec);const [n,d]=rate(spec[key]);a=a*d+n*b;b*=d;const g=gcd(a,b);a/=g;b/=g;}
   const remKey=key==='hp'?'hpRegenRemainder':'mpRegenRemainder',maxKey=key==='hp'?'maxHp':'maxMp',old=resource(next.player[key]),max=resource(next.player[maxKey]),r=next[remKey];
   if(old>=max||(key==='hp'&&next.player.lifeState==='dead')){next.player[key]=(old>=max?max:old).toString();next[remKey]={numerator:0,denominator:1};continue;}
   const denominator=BigInt(r.denominator)*b*1000n,numerator=BigInt(r.numerator)*b*1000n+a*BigInt(end-at)*BigInt(r.denominator),value=old+numerator/denominator;
   if(value>=max){next.player[key]=max.toString();next[remKey]={numerator:0,denominator:1};}else {next.player[key]=value.toString();next[remKey]=reduced(numerator%denominator,denominator);}
  }}
  at=end;next.buffs=next.buffs.filter(b=>BigInt(b.endsAtTick)*10n>BigInt(at));
 }
 return parseRoleCheckpoint(next);
}
