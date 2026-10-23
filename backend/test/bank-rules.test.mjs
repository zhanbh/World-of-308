import test from 'node:test';
import assert from 'node:assert/strict';
import { planStackTransfer } from '../src/bank/bank-rules.ts';
const catalog = { potion: { version: 1, kind: 'consumable', quickAssignable: true } };
const stack = (id, quantity, binding={kind:'none'}) => ({kind:'stack',stackId:id,templateRef:{id:'potion',version:1},quantity,binding,traceRef:`old-${id}`});
const container = (id,kind,slots={}) => ({schemaVersion:2,id,accountId:'a',...(kind==='accountVault'?{}:{characterId:'c'}),kind,capacity:kind==='accountVault'?100:20,stage:0,slots,version:0,createdAt:1,updatedAt:1});
test('transfer fills compatible stack and records source remainder and destination ancestry',()=>{
 const source=container('bag','backpack',{0:stack('s',12)}), target=container('vault','personalVault',{3:stack('t',17)});
 const result=planStackTransfer(source,target,'s',8,'journal',catalog);
 assert.equal(result.sourceSlots[0].quantity,4);
 assert.equal(result.targetSlots[3].quantity,20);
 assert.equal(result.targetSlots[0].quantity,5);
 assert.deepEqual(result.lineage.inputs.map(s=>s.quantity),[12,17]);
 assert.deepEqual(result.lineage.outputs.map(s=>s.quantity),[4,20,5]);
 assert.equal(source.slots[0].quantity,12);
});
test('capacity shortage refuses entire transfer and reports compatible capacity',()=>{
 const target=container('vault','personalVault',Object.fromEntries(Array.from({length:20},(_,i)=>[i,stack(`t${i}`,20)])));target.slots[5].quantity=18;
 const source=container('bag','backpack',{0:stack('s',8)});
 assert.throws(()=>planStackTransfer(source,target,'s',3,'j',catalog),e=>e.code==='CONTAINER_FULL'&&e.availableCapacity===2);
 assert.equal(source.slots[0].quantity,8);assert.equal(target.slots[5].quantity,18);
});
test('character binding permits personal storage but refuses account storage',()=>{
 const source=container('bag','backpack',{0:stack('s',8,{kind:'character',accountId:'a',characterId:'c'})});
 assert.equal(planStackTransfer(source,container('v','personalVault'),'s',8,'j',catalog).targetSlots[0].binding.characterId,'c');
 assert.throws(()=>planStackTransfer(source,container('v','accountVault'),'s',8,'j',catalog),e=>e.code==='BINDING_RESTRICTED');
});
test('equipment transfer preserves attributes and clears holder only in account storage',async()=>{
 const {planEquipmentTransfer}=await import('../src/bank/bank-rules.ts');
 const item={schemaVersion:2,id:'i',accountId:'a',holderCharacterId:'c',location:{kind:'container',containerId:'bag'},lifecycle:'active',binding:{kind:'none'},version:7,durability:{current:0,max:100},slotKind:'weapon',itemLevel:10,quality:'green',rolledAffixes:[{stat:'ap',value:2}]};
 const source=container('bag','backpack',{0:{kind:'equipment',itemId:'i',sortHeader:{itemLevel:10,quality:'green',slotKind:'weapon'}}});
 const result=planEquipmentTransfer(source,container('v','accountVault'),item,'c',catalog);
 assert.equal(result.sourceSlots[0],undefined);assert.equal(result.targetSlots[0].itemId,'i');
 assert.equal(result.nextItem.holderCharacterId,undefined);assert.equal(result.nextItem.version,7);
 assert.deepEqual(result.nextItem.durability,item.durability);assert.deepEqual(result.nextItem.rolledAffixes,item.rolledAffixes);
});
test('explicit expansion prices debit only selected currency with uint64 exactness',async()=>{
 const {expansionOffer,planExpansionPayment}=await import('../src/bank/bank-rules.ts');
 const config={ref:{id:'bank-test',version:1},profile:'test',backpack:{1:{gold:'9007199254740993'}},personalVault:{1:{gold:'100',points:'3'}}};
 const offer=expansionOffer(container('v','personalVault'),1,config);
 assert.deepEqual(offer.costs,[{currency:'gold',amount:'100'},{currency:'points',amount:'3'}]);assert.equal(offer.capacity,40);
 assert.deepEqual(planExpansionPayment({gold:'9007199254740995',points:'5'},'gold',expansionOffer(container('b','backpack'),1,config)),{gold:'2',points:'5',cost:'9007199254740993'});
 assert.deepEqual(planExpansionPayment({gold:'100',points:'5'},'points',offer),{gold:'100',points:'2',cost:'3'});
});
test('account binding and template version remain distinct transfer pools',()=>{
 const source=container('b','backpack',{0:stack('s',5,{kind:'account',accountId:'a'})});
 const target=container('v','personalVault',{0:stack('u',17),1:stack('a',19,{kind:'account',accountId:'a'})});
 const result=planStackTransfer(source,target,'s',5,'j',catalog);
 assert.equal(result.targetSlots[0].quantity,17);assert.equal(result.targetSlots[1].quantity,20);assert.equal(result.targetSlots[2].quantity,4);
 assert.deepEqual(result.lineage.inputs.map(s=>s.stackId),['s','a']);
});
test('vault-to-vault and foreign role transfers are rejected',()=>{
 assert.throws(()=>planStackTransfer(container('v','personalVault',{0:stack('s',1)}),container('a','accountVault'),'s',1,'j',catalog),e=>e.code==='LOCATION_NOT_ALLOWED');
 const other=container('v','personalVault');other.characterId='other';
 assert.throws(()=>planStackTransfer(container('b','backpack',{0:stack('s',1)}),other,'s',1,'j',catalog),e=>e.code==='NOT_FOUND_OR_FORBIDDEN');
});
test('missing and illegal prices never fall back; stage jumps and shared vault expansion are refused',async()=>{
 const {expansionOffer,planExpansionPayment}=await import('../src/bank/bank-rules.ts');
 const b=container('b','backpack');
 assert.throws(()=>expansionOffer(b,1),e=>e.code==='CONFIG_NOT_READY');
 assert.throws(()=>expansionOffer(b,2),e=>e.code==='UNLOCK_STAGE_MISMATCH');
 assert.throws(()=>expansionOffer(container('v','accountVault'),1),e=>e.code==='LOCATION_NOT_ALLOWED');
 for(const price of ['01','0','-1','18446744073709551616',20]) {
  const config={ref:{id:'test',version:1},profile:'test',backpack:{1:{gold:price}},personalVault:{}};
  assert.throws(()=>expansionOffer(b,1,config),e=>e.code==='CONFIG_NOT_READY');
 }
 assert.throws(()=>planExpansionPayment({gold:'2',points:'10'},'gold',{costs:[{currency:'gold',amount:'3'}]}),e=>e.code==='CURRENCY_NOT_ENOUGH');
});
test('duplicate physical identifiers across containers fail closed',()=>{
 assert.throws(()=>planStackTransfer(container('b','backpack',{0:stack('same',2)}),container('v','personalVault',{1:stack('same',3)}),'same',1,'j',catalog),e=>e.code==='CONFIG_NOT_READY');
});
