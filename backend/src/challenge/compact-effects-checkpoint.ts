import {validateCrossState} from '../../../shared/src/cross-combat-kernel.ts';
/** Stable effect slots and one shared snapshot dictionary. Future monster fixture is codec-only. */
export const EFFECT_SLOTS=608;
export const byteSize=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length;
const fail=():never=>{throw new TypeError('INVALID_COMPACT_EFFECTS');};
export const pair=(r:any)=>[BigInt(r.n)<=4294967295n?Number(r.n):r.n,Number(r.d)];
export function unpair(v:any){if(!Array.isArray(v)||v.length!==2||!(typeof v[0]==='string'&&/^(0|[1-9][0-9]*)$/.test(v[0])||Number.isSafeInteger(v[0])&&v[0]>=0)||!Number.isSafeInteger(v[1])||v[1]<1||v[1]>4294967295)fail();const n=BigInt(v[0]),d=BigInt(v[1]);if(n>18446744073709551615n||typeof v[0]==='number'&&v[0]>4294967295||Object.is(v[0],-0))fail();let a=n,b=d;while(b){const t=a%b;a=b;b=t;}if(a!==1n)fail();return {n:String(v[0]),d:String(v[1])};}
export const snapshotRow=(s:any)=>[s.attackPower,...[s.haste,s.damageBonus,s.hit,s.crit,s.critMultiplier,s.mastery].flatMap(pair),s.x,s.y,s.facing,s.level];
export function restoreSnapshot(a:any){if(!Array.isArray(a)||a.length!==17)fail();return {attackPower:a[0],haste:unpair(a.slice(1,3)),damageBonus:unpair(a.slice(3,5)),hit:unpair(a.slice(5,7)),crit:unpair(a.slice(7,9)),critMultiplier:unpair(a.slice(9,11)),mastery:unpair(a.slice(11,13)),x:a[13],y:a[14],facing:a[15],level:a[16]};}
export type CompactEffects={schemaVersion:4;kind:'stableSkillEffects';slots:(unknown[]|null)[]};
const integer=(v:any,min:number,max:number)=>{if(!Number.isSafeInteger(v)||v<min||v>max||Object.is(v,-0))fail();};
const budget=(v:any)=>{if(typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>18446744073709551615n)fail();};
export function effectIdentity(row:any):string {if(!Array.isArray(row)||row.length<3)fail();integer(row[0],0,11);integer(row[1],0,2);integer(row[2],1,2147483647);if(row[1]===1){if(row.length!==8)fail();integer(row[3],0,3);integer(row[4],1,8);unpair(row[5]);integer(row[6],0,4);budget(row[7]);}else{if(row.length!==5)fail();if(row[1]===0){if(!Array.isArray(row[3])||row[3].length>8||new Set(row[3]).size!==row[3].length)fail();row[3].forEach((v:any)=>integer(v,1,8));}else integer(row[3],1,4);budget(row[4]);}return JSON.stringify(row[1]===1?row.slice(0,5):row.slice(0,3));}
export function allocateEffectSlots(rows:unknown[][],previous:CompactEffects[]=[]):CompactEffects[]{
 if(rows.length>3648||previous.length>6)fail();const live=new Map<string,unknown[]>();for(const row of rows){const id=effectIdentity(row);if(live.has(id)||byteSize(row)>128)fail();live.set(id,row);}
 const slots:(unknown[]|null)[]=Array(3648).fill(null);const seen=new Set<string>();for(let chunk=0;chunk<previous.length;chunk++){const p=previous[chunk];if(p.schemaVersion!==4||p.kind!=='stableSkillEffects'||!Array.isArray(p.slots)||p.slots.length!==608||Object.keys(p).sort().join(',')!=='kind,schemaVersion,slots')fail();for(let j=0;j<608;j++){const row=p.slots[j];if(row===null)continue;const id=effectIdentity(row);if(seen.has(id))fail();seen.add(id);if(live.has(id)){slots[chunk*608+j]=live.get(id)!;live.delete(id);}}}
 let free=0;for(const row of live.values()){while(slots[free]!==null)free++;slots[free]=row;}
 let last=slots.length-1;while(last>=0&&slots[last]===null)last--;const count=Math.ceil((last+1)/608);return Array.from({length:count},(_,i)=>({schemaVersion:4,kind:'stableSkillEffects',slots:slots.slice(i*608,(i+1)*608)}));
}

/** Compatibility for historical decimal-string rational pairs; other fields remain exact. */
export function normalizeLegacyPairs(v:any):any {if(Array.isArray(v)){if(v.length===2&&v.every(x=>typeof x==='string'||typeof x==='number')&&v.every(x=>/^(0|[1-9][0-9]*)$/.test(String(x)))){const n=BigInt(v[0]),d=BigInt(v[1]);return [n<=4294967295n?Number(n):String(n),Number(d)];}return v.map(normalizeLegacyPairs);}if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,normalizeLegacyPairs(x)]));return v;}

/** Protocol-domain fixture boundary only: lane4..11 reserves future monster actors, without AI scheduling. */
export function validateCompactDomain(blocks:CompactEffects[],snapshots:unknown[][]){
 if(snapshots.length>228||blocks.length>6)fail();const dictionary=new Set<string>();for(const entry of snapshots){if(!Array.isArray(entry)||entry.length!==3)fail();integer(entry[0],0,11);integer(entry[1],1,2147483647);const id=JSON.stringify(entry.slice(0,2));if(dictionary.has(id)||byteSize(entry[2])>192)fail();dictionary.add(id);const snapshot=restoreSnapshot(entry[2]);validateCrossState({castSequence:1,randomCursor:0,readyAtUs:{n:'0',d:'1'},cast:null,effects:[{kind:'bleed',sequence:1,node:0,targetIndex:1,originUs:{n:'0',d:'1'},nextJump:0,snapshot,budget:'0'}]});}
 const rows:unknown[][]=[];for(const block of blocks){if(block.schemaVersion!==4||block.kind!=='stableSkillEffects'||!Array.isArray(block.slots)||block.slots.length!==608||Object.keys(block).sort().join(',')!=='kind,schemaVersion,slots')fail();for(const row of block.slots){if(row===null)continue;effectIdentity(row);if(byteSize(row)>128||!dictionary.has(JSON.stringify(row.slice(0,1).concat(row.slice(2,3)))))fail();rows.push(row);}}
 if(rows.length>3648||new Set(rows.map(effectIdentity)).size!==rows.length)fail();return {effects:rows.length,snapshots:dictionary.size};
}
