import assert from 'node:assert/strict';
import {createBankFixture} from './bank-fixture.mjs';
import {RepairService} from '../../src/repair/repair-service.ts';
import {EquipmentService} from '../../src/equipment/equipment-service.ts';
import {TownService} from '../../src/town/town-service.ts';
import {ShopService} from '../../src/shop/shop-service.ts';
export const REPAIR_TEST_CONFIG={profile:'local-test',authorization:'isolated-local-assets-only',ref:'repair-candidate-v1',contextTtlMs:30000,prices:{'10':{white:'1',green:'1',blue:'2'},'30':{white:'3',green:'3',blue:'5',purple:'6',orange:'9'}}};
export async function repairFixture(options={}){
 const f=await createBankFixture();f.town=new TownService({store:f.store,clock:f.clock,identity:f.identity});let now=1000,seq=0;f.clock.now=()=>now;
 for(const [dx,dy] of [[100,100],[100,100]]){const r=await f.town.move({...f.auth,command:'town.move',operationId:'repair-walk-'+(++seq),expected:[],payload:{characterId:f.characterId,steps:[{seq:f.character().townState.acceptedSeq+1,dx,dy,dtMs:1000}]}});assert.equal(r.outcome.status,'committed');}
 const openRequests=[];const open=async(kind='repair',anchorId='blacksmith')=>{const request={...f.auth,command:'service.open',operationId:'repair-open-'+(++seq),expected:[{kind:'character',id:f.characterId,version:f.character().version}],payload:{characterId:f.characterId,serviceKind:kind,anchorId}};openRequests.push(structuredClone(request));const r=await f.town.openService(request);assert.equal(r.outcome.status,'committed',JSON.stringify(r));assert.equal(r.outcome.resultVersions.find(v=>v.kind==='character')?.version,f.character().version);return r.outcome.data.contextId;};
 const contextId=await open();await f.fund('1000','3');
 const weaponId=f.character().equipped.weapon;
 await f.store.run(async tx=>{const w=await tx.get(weaponId);tx.set(w.id,{...w,durability:{...w.durability,current:0,max:60},rolledAffixes:[{stat:'attackPower',value:20}]});});
 const service=new RepairService({store:f.store,clock:f.clock,identity:f.identity,config:REPAIR_TEST_CONFIG,...options});
 const equipment=new EquipmentService({store:f.store,clock:f.clock,identity:f.identity}),shop=new ShopService({store:f.store,clock:f.clock,identity:f.identity});
 const quote=(itemId=weaponId,context=contextId)=>service.query({...f.auth,query:'service.quote',requestId:'repair-q-'+(++seq),payload:{characterId:f.characterId,contextId:context,serviceIntent:{command:'equipment.repair',payload:{characterId:f.characterId,contextId:context,target:{kind:'single',itemId},quoteRef:'unquoted'}}}});
 const command=q=>({...f.auth,command:'equipment.repair',operationId:'repair-op-'+(++seq),expected:q.data.targetVersions,payload:{characterId:f.characterId,contextId,target:{kind:'single',itemId:q.data.repair.items[0].itemId},quoteRef:q.data.quoteRef}});
 const transport={send:async text=>{const q=JSON.parse(text);return JSON.stringify(q.command==='equipment.repair'?await service.execute(q):q.command==='service.open'?await f.town.openService(q):q.command==='service.close'?await f.town.closeService(q):q.query==='service.quote'||q.query==='operation.get'||q.query==='repair.get'?await service.query(q):q.query==='account.get'?await shop.query(q):await equipment.query(q));}};
 return {...f,initialOpenRequest:openRequests[0],contextId,weaponId,service,equipment,shop,quote,command,transport,open,setNow:t=>{now=t;}};
}
