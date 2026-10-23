import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
import { EquipmentService } from '../src/equipment/equipment-service.ts';
import { ShopService } from '../src/shop/shop-service.ts';
import { TownService } from '../src/town/town-service.ts';
import { DEFAULT_TOWN_MAP } from '../src/town/town-model.ts';
import { loginKey } from '../src/identity/identity-v2.ts';

test('actual ST05 unequip output moves into personal bank and back without changing initial weapon',async()=>{
 const f=await createBankFixture();const service=new EquipmentService({store:f.store,clock:f.clock,identity:f.identity});const id=f.character().equipped.weapon;const original=f.store.inspect(id);
 const unequip=await service.execute({...f.auth,command:'equipment.unequip',operationId:'composition-unequip',expected:[{kind:'character',id:f.characterId,version:f.character().version},{kind:'container',id:f.bag().id,version:f.bag().version}],payload:{characterId:f.characterId,itemId:id,slot:'weapon'}});
 assert.equal(unequip.outcome.status,'committed');assert.equal(f.character().equipped.weapon,undefined);
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:id},1))).outcome.status,'committed');
 assert.equal(Object.values(f.vault().slots).some(s=>s.itemId===id),true);
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:id},1,'personalVault',true))).outcome.status,'committed');
 const moved=f.store.inspect(id);assert.deepEqual(moved.sourceLocator,original.sourceLocator);assert.deepEqual(moved.rolledAffixes,original.rolledAffixes);assert.deepEqual(moved.binding,original.binding);assert.deepEqual(moved.durability,original.durability);assert.deepEqual(moved.location,{kind:'container',containerId:f.bag().id});
});

test('actual ST06 potion and equipment purchases enter bank using published explicit test content',async()=>{
 const f=await createBankFixture();await f.fund();
 // This isolated map places both services in legal range; service.open still validates real position/epochs.
 const manifest=structuredClone(DEFAULT_TOWN_MAP);manifest.serviceAnchors.shop.x=105;manifest.serviceAnchors.shop.y=100;
 const town=new TownService({store:f.store,clock:f.clock,manifest});const opened=await town.openService({...f.auth,command:'service.open',operationId:'composition-shop-open',expected:[],payload:{characterId:f.characterId,serviceKind:'shop',anchorId:'shop'}});assert.equal(opened.outcome.status,'committed');const contextId=opened.outcome.data.contextId;
 const shop=new ShopService({store:f.store,clock:f.clock,identity:f.identity,catalog:{quoteRef:'composition-test',offers:{potion:{offerId:'potion',templateId:'potion',itemKind:'potion',quality:'white',priceCurrency:'gold',unitPrice:5,maxQuantity:20,quoteRef:'composition-test'},sword:{offerId:'sword',templateId:'composition-sword',itemKind:'equipment',slotKind:'weapon',itemLevel:10,quality:'white',priceCurrency:'gold',unitPrice:100,maxQuantity:1,quoteRef:'composition-test'}}}});
 for(const [offerId,quantity]of [['potion',7],['sword',1]]){const r=await shop.execute({...f.auth,command:'shop.buy',operationId:`composition-buy-${offerId}`,expected:[],payload:{characterId:f.characterId,contextId,offerId,quantity,quoteRef:'composition-test'}});assert.equal(r.outcome.status,'committed');}
 assert.equal(f.wallet().gold,'9865');const stack=Object.values(f.bag().slots).find(s=>s.kind==='stack');const itemSlot=Object.values(f.bag().slots).find(s=>s.kind==='equipment');const item=f.store.inspect(itemSlot.itemId);
 assert.equal((await f.service.execute(f.transfer({kind:'stack',stackId:stack.stackId},7,'accountVault'))).outcome.status,'committed');assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id},1,'accountVault'))).outcome.status,'committed');
 assert.equal(Object.values(f.vault('accountVault').slots).find(s=>s.kind==='stack').quantity,7);const moved=f.store.inspect(item.id);assert.deepEqual(moved.sourceLocator,item.sourceLocator);assert.deepEqual(moved.rolledAffixes,item.rolledAffixes);assert.equal(moved.holderCharacterId,undefined);assert.equal(f.wallet().gold,'9865');
});

test('shared eligible set increments both account class keys and only the usable role key',async()=>{
 const keys=['warrior','hunter'].map(classId=>({collectionKey:`shared-${classId}`,setId:'shared-set',setVersion:1,itemLevel:30,slotId:'ring',classId}));
 const f=await createBankFixture({holdingsDomain:{ref:'bank-test-domain',keys}});const id='shared-ring';const h=await loginKey('holdings',[f.account().id,'character',f.characterId]);const ah=await loginKey('holdings',[f.account().id,'account']);
 await f.store.run(async tx=>{tx.set(id,{schemaVersion:2,id,accountId:f.account().id,holderCharacterId:f.characterId,sourceKey:'admitted-shared',sourceOrdinal:0,sourceLocator:{kind:'grant',grantId:'admitted-shared'},templateRef:{id:'shared-ring',version:1},slotKind:'ring',itemLevel:30,quality:'orange',rolledAffixes:[],setRef:{id:'shared-set',version:1},binding:{kind:'none'},enhancementLevel:0,durability:{wearEnabled:false,current:null,max:null,policyRef:'test'},location:{kind:'container',containerId:f.bag().id},lifecycle:'active',version:1,createdAt:1000,updatedAt:1000});tx.set(f.bag().id,{...f.bag(),slots:{0:{kind:'equipment',itemId:id,sortHeader:{itemLevel:30,quality:'orange',slotKind:'ring'}}}});const summary=await tx.get(h);tx.set(h,{...summary,entries:[{collectionKey:'shared-warrior',permanentCount:1,mailLatestExpiryAt:null}]});});
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:id},1,'accountVault'))).outcome.status,'committed');assert.deepEqual(f.store.inspect(ah).entries.map(e=>[e.collectionKey,e.permanentCount]),[['shared-warrior',1],['shared-hunter',1]]);assert.deepEqual(f.store.inspect(h).entries.map(e=>[e.collectionKey,e.permanentCount]),[['shared-warrior',0]]);
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:id},1,'accountVault',true))).outcome.status,'committed');assert.deepEqual(f.store.inspect(ah).entries.map(e=>e.permanentCount),[0,0]);assert.deepEqual(f.store.inspect(h).entries.map(e=>[e.collectionKey,e.permanentCount]),[['shared-warrior',1]]);
});
