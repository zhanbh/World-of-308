import assert from 'node:assert/strict';
import {createBankFixture} from './bank-fixture.mjs';
import {TownService} from '../../src/town/town-service.ts';
import {EnhancementService} from '../../src/enhancement/enhancement-service.ts';
export async function enhancementFixture(options={}){
 const f=await createBankFixture();f.town=new TownService({store:f.store,clock:f.clock,identity:f.identity,manifest:options.manifest});let seq=0;
 for(const [dx,dy] of [[100,100],[100,100],[40,0]]){const r=await f.town.move({...f.auth,command:'town.move',operationId:'enhance-walk-'+(++seq),expected:[],payload:{characterId:f.characterId,steps:[{seq:f.character().townState.acceptedSeq+1,dx,dy,dtMs:1000}]}});assert.equal(r.outcome.status,'committed');}
 const opened=await f.town.openService({...f.auth,command:'service.open',operationId:'enhance-open',expected:[{kind:'character',id:f.characterId,version:f.character().version}],payload:{characterId:f.characterId,serviceKind:'enhance',anchorId:'mary'}});assert.equal(opened.outcome.status,'committed',JSON.stringify(opened));
 const contextId=opened.outcome.data.contextId,weaponId=f.character().equipped.weapon;await f.fund('1000');
 await f.store.run(async tx=>{const w=await tx.get(weaponId),b=await tx.get(f.bag().id);tx.set(w.id,{...w,durability:{...w.durability,current:30,max:60},rolledAffixes:[{stat:'attackPower',value:20}]});tx.set(b.id,{...b,slots:{0:{kind:'stack',stackId:'ore-stack',templateRef:{id:'ore',version:1},quantity:20,binding:{kind:'none'},traceRef:'ore-admitted'}}});});
 const config={profile:'local-test',authorization:'isolated-local-assets-only',ref:'enhance-low-v1',contextTtlMs:30000,probabilityScale:1000000,probabilityCap:900000,luckPerPoint:1000,luckCap:50000,memoryStep:30000,memorySourceCap:150000,memoryTotalCap:150000,distanceWeights:Array.from({length:20},(_,i)=>i===0?1000000:i===1?600000:i===2?140000:0),goldByItemLevel:{10:{weapon:Array.from({length:10},(_,i)=>String((i+1)*10)),earring:Array.from({length:10},(_,i)=>String((i+1)*8))}},materialTemplateRef:'ore',materialsByTarget:Array(10).fill(1),earringAttackPowerByTarget:['2','6','12','20','30','42','56','72','90','110'],...options.config};
 const sample=options.sample??0,service=new EnhancementService({store:f.store,clock:f.clock,identity:f.identity,config,manifest:options.manifest,random:options.random??{sample:async()=>sample}});
 const payload=(itemId=weaponId,targetLevel=1)=>({characterId:f.characterId,contextId,itemId,targetLevel,useMemento:false,quoteRef:'unquoted'});
 const quote=(itemId=weaponId,targetLevel=1)=>service.query({...f.auth,query:'service.quote',requestId:'enhance-q-'+(++seq),payload:{characterId:f.characterId,contextId,serviceIntent:{command:'equipment.enhance',payload:payload(itemId,targetLevel)}}});
 const command=q=>({...f.auth,command:'equipment.enhance',operationId:'enhance-op-'+(++seq),expected:q.data.targetVersions,payload:{...payload(),quoteRef:q.data.quoteRef}});
 const view=(itemId=weaponId)=>service.query({...f.auth,query:'enhancement.get',requestId:'enhance-v-'+(++seq),payload:{characterId:f.characterId,contextId,itemId}});
 const transport={send:async text=>{const q=JSON.parse(text);return JSON.stringify(q.command==='equipment.enhance'?await service.execute(q):q.command==='service.open'?await f.town.openService(q):await service.query(q));}};
 return {...f,contextId,weaponId,service,config,quote,command,view,transport};
}
