import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFixture } from './fixtures/bank-fixture.mjs';

test('bank reads real account vault independently from personal vault and backpack', async()=>{
 const f=await createBankFixture();
 const personal=await f.query('bank.get',{vaultKind:'personalVault'});
 assert.equal(personal.data.vault.kind,'personalVault'); assert.equal(personal.data.vault.capacity,20);
 const shared=await f.query('bank.get',{vaultKind:'accountVault'});
 assert.equal(shared.data.vault.kind,'accountVault'); assert.equal(shared.data.vault.capacity,100);
 assert.notEqual(shared.data.vault.containerId,shared.data.backpack.containerId);
 assert.equal(shared.versions.length,4);
});

test('transfer conserves quantities and changes lineage of remainder and merged output',async()=>{
 const f=await createBankFixture();await f.seed({1:f.stack('source',15)});await f.seed({2:f.stack('destination',18)},'personalVault');
 const cmd=f.transfer({kind:'stack',stackId:'source'},7);const r=await f.service.execute(cmd);assert.equal(r.outcome.status,'committed');
 assert.equal(f.bag().slots[1].quantity,8);assert.deepEqual(Object.values(f.vault().slots).map(s=>s.quantity),[5,20]);
 const {j}=await f.keys(cmd.operationId);const lineage=f.store.inspect(j).changes.lineage;assert.equal(lineage.inputs.reduce((n,s)=>n+s.quantity,0),33);assert.equal(lineage.outputs.reduce((n,s)=>n+s.quantity,0),33);assert.ok(lineage.outputs.every(s=>s.traceRef.startsWith(j+':')));
 const before=f.store.snapshot();assert.equal((await f.service.execute(cmd)).replayed,true);assert.deepEqual(f.store.snapshot(),before);
 assert.equal((await f.service.execute({...cmd,payload:{...cmd.payload,quantity:8}})).outcome.code,'OPERATION_MISMATCH');
});

test('capacity refusal reports exact fitting quantity and never partially moves',async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('s',10)});const slots=Object.fromEntries(Array.from({length:20},(_,i)=>[i,f.stack(`d${i}`,i===0?18:20)]));await f.seed(slots,'personalVault');
 const beforeBag=f.bag(),beforeVault=f.vault(),r=await f.service.execute(f.transfer({kind:'stack',stackId:'s'},3));assert.equal(r.outcome.code,'CONTAINER_FULL');assert.equal(r.outcome.availableCapacity,2);assert.deepEqual(f.bag(),beforeBag);assert.deepEqual(f.vault(),beforeVault);
});

test('character binding may enter personal vault but never account vault',async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('bound',5,{kind:'character',accountId:f.account().id,characterId:f.characterId})});assert.equal((await f.service.execute(f.transfer({kind:'stack',stackId:'bound'},2,'accountVault'))).outcome.code,'BINDING_RESTRICTED');assert.equal((await f.service.execute(f.transfer({kind:'stack',stackId:'bound'},2))).outcome.status,'committed');
});

for(const field of ['sceneEpoch','locationRevision','rolePlayEpoch','accountId','status'])test(`bank refuses stale/foreign context ${field}`,async()=>{
 const f=await createBankFixture();await f.store.run(async tx=>{const c=await tx.get(f.contextId);tx.set(c.id,{...c,[field]:typeof c[field]==='number'?c[field]+1:'other'});});assert.equal((await f.query('bank.get',{vaultKind:'accountVault'})).error.code,'CONTEXT_INVALID');
});

test('bank requires real town location/range, selected role and trusted identity',async()=>{
 const f=await createBankFixture();await f.store.run(tx=>tx.set(f.characterId,{...f.character(),townState:{...f.character().townState,position:{x:999,y:999}}}));assert.equal((await f.query('bank.get',{vaultKind:'personalVault'})).error.code,'LOCATION_NOT_ALLOWED');
 f.setSubject('another');assert.equal((await f.query('bank.get',{vaultKind:'personalVault'})).error.code,'AUTH_REQUIRED');
});

test('expansion charges chosen currency once and quote cannot survive version changes',async()=>{
 const f=await createBankFixture();await f.fund();const cmd=await f.expand('personalVault','points');assert.equal((await f.service.execute(cmd)).outcome.status,'committed');assert.equal(f.vault().capacity,40);assert.equal(f.wallet().points,'98');assert.equal(f.wallet().gold,'10000');assert.equal((await f.service.execute(cmd)).replayed,true);assert.equal(f.wallet().points,'98');
 const stale=await f.expand();await f.fund('9999');await f.store.run(tx=>tx.set(f.wallet().id,{...f.wallet(),version:f.wallet().version+1}));assert.equal((await f.service.execute(stale)).outcome.code,'VERSION_CONFLICT');
});

test('missing formal price configuration fails closed without asset writes',async()=>{
 const f=await createBankFixture({expansionConfig:undefined});await f.fund();const before=f.store.snapshot();const q=await f.query('inventory.expansionQuote',{containerId:f.bag().id,targetStage:1});assert.equal(q.error.code,'CONFIG_NOT_READY');assert.deepEqual(f.store.snapshot(),before);
});

for(const write of [1,2,3,4,5])test(`transfer atomic fault at write ${write}`,async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('s',10)});const cmd=f.transfer({kind:'stack',stackId:'s'},5),before=f.store.snapshot();f.store.injectWriteFailure(write);assert.equal((await f.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(f.store.snapshot(),before);
});
for(const write of [1,2,3,4,5])test(`expansion atomic fault at write ${write}`,async()=>{
 const f=await createBankFixture();await f.fund();const cmd=await f.expand(),before=f.store.snapshot();f.store.injectWriteFailure(write);assert.equal((await f.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(f.store.snapshot(),before);
});

test('lost transfer response resolves original outcome and never duplicates',async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('s',10)});const cmd=f.transfer({kind:'stack',stackId:'s'},5);f.store.injectResponseLoss();assert.equal((await f.service.execute(cmd)).outcome.status,'unknown');const found=await f.query('operation.get',{operationId:cmd.operationId});assert.equal(found.data.result.outcome.status,'committed');const before=f.store.snapshot();assert.equal((await f.service.execute(cmd)).replayed,true);assert.deepEqual(f.store.snapshot(),before);
});

test('two currencies racing one personal stage only charge one',async()=>{
 const f=await createBankFixture();await f.fund();const a=await f.expand('personalVault','gold'),b=await f.expand('personalVault','points');let arrivals=0,release;const barrier=new Promise(r=>release=r);f.store.beforeCommit=async attempt=>{if(attempt===0){if(++arrivals===2)release();await barrier;}};const results=await Promise.all([f.service.execute(a),f.service.execute(b)]);f.store.beforeCommit=undefined;assert.equal(results.filter(r=>r.outcome.status==='committed').length,1);assert.equal(f.vault().capacity,40);assert.ok(f.wallet().gold==='9850'&&f.wallet().points==='100'||f.wallet().gold==='10000'&&f.wallet().points==='98');
});

async function seedEquipment(f,set=false){
 const id='bank-gear',item={schemaVersion:2,id,accountId:f.account().id,holderCharacterId:f.characterId,sourceKey:'admitted-gear',sourceOrdinal:0,sourceLocator:{kind:'grant',grantId:'admitted-gear'},templateRef:{id:'warrior-weapon',version:1},slotKind:'weapon',itemLevel:30,quality:set?'orange':'blue',rolledAffixes:[{stat:'strength',value:12}],setRef:set?{id:'warrior-set',version:1}:null,binding:{kind:'none'},enhancementLevel:5,durability:{wearEnabled:true,current:0,max:100,policyRef:'test'},location:{kind:'container',containerId:f.bag().id},lifecycle:'active',version:2,createdAt:1000,updatedAt:1000};
 await f.store.run(tx=>{tx.set(id,item);tx.set(f.bag().id,{...f.bag(),slots:{...f.bag().slots,3:{kind:'equipment',itemId:id,sortHeader:{itemLevel:30,quality:item.quality,slotKind:'weapon'}}}});});return item;
}
const domain={ref:'bank-test-domain',keys:[{collectionKey:'warrior-set-weapon',setId:'warrior-set',setVersion:1,itemLevel:30,slotId:'weapon',classId:'warrior'}]};
async function seedHolding(f){const id=await import('../src/identity/identity-v2.ts').then(m=>m.loginKey('holdings',[f.account().id,'character',f.characterId]));await f.store.run(async tx=>{const h=await tx.get(id);tx.set(id,{...h,entries:[{collectionKey:'warrior-set-weapon',permanentCount:1,mailLatestExpiryAt:5000}]});});return id;}

test('whole equipment crosses scope preserving stats, bound identity and zero durability',async()=>{
 const f=await createBankFixture({holdingsDomain:domain});await f.seed({1:f.stack('s',2)});const item=await seedEquipment(f,true),h=await seedHolding(f);const cmd=f.transfer({kind:'equipment',itemId:item.id},1,'accountVault');assert.equal((await f.service.execute(cmd)).outcome.status,'committed');const moved=f.store.inspect(item.id);assert.equal(moved.holderCharacterId,undefined);assert.deepEqual(moved.location,{kind:'container',containerId:f.vault('accountVault').id});assert.deepEqual(moved.rolledAffixes,item.rolledAffixes);assert.equal(moved.durability.current,0);assert.equal(moved.enhancementLevel,5);assert.equal(f.store.inspect(h).entries[0].permanentCount,0);assert.equal(f.store.inspect(h).entries[0].mailLatestExpiryAt,5000);
 const {loginKey}=await import('../src/identity/identity-v2.ts');const ah=await loginKey('holdings',[f.account().id,'account']);assert.equal(f.store.inspect(ah).entries[0].permanentCount,1);
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id},1,'accountVault',true))).outcome.status,'committed');assert.equal(f.store.inspect(h).entries[0].permanentCount,1);assert.equal(f.store.inspect(ah).entries[0].permanentCount,0);assert.equal(f.store.inspect(item.id).holderCharacterId,f.characterId);
});

test('same-role personal storage keeps holdings unchanged; non-set account transfer requires no domain',async()=>{
 const f=await createBankFixture();const item=await seedEquipment(f);const before=f.store.snapshot();assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id}))).outcome.status,'committed');for(const[id,v]of before)if(v.scope==='character'||v.scope==='account')assert.deepEqual(f.store.inspect(id),v);
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id},1,'personalVault',true))).outcome.status,'committed');assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id},1,'accountVault'))).outcome.status,'committed');
});

for(const write of [1,2,3,4,5,6,7,8])test(`set equipment and both holdings rollback at write ${write}`,async()=>{
 const f=await createBankFixture({holdingsDomain:domain});const item=await seedEquipment(f,true);await seedHolding(f);const cmd=f.transfer({kind:'equipment',itemId:item.id},1,'accountVault'),before=f.store.snapshot();f.store.injectWriteFailure(write);assert.equal((await f.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(f.store.snapshot(),before);
});

test('missing role summary is integrity error, never reconstructed from guessed zero',async()=>{
 const f=await createBankFixture({holdingsDomain:domain});const item=await seedEquipment(f,true);const {loginKey}=await import('../src/identity/identity-v2.ts');const h=await loginKey('holdings',[f.account().id,'character',f.characterId]);await f.store.run(tx=>tx.set(h,undefined));const before=f.bag();assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id},1,'accountVault'))).outcome.code,'CONFIG_NOT_READY');assert.deepEqual(f.bag(),before);
});

test('other-class set storage updates shared eligibility without counting unusable private items',async()=>{
 const other={ref:'bank-test-domain',keys:[{...domain.keys[0],classId:'hunter',collectionKey:'hunter-key'}]};const f=await createBankFixture({holdingsDomain:other}),item=await seedEquipment(f,true);const {loginKey}=await import('../src/identity/identity-v2.ts'),role=await loginKey('holdings',[f.account().id,'character',f.characterId]),account=await loginKey('holdings',[f.account().id,'account']);const before=f.store.inspect(role);
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id},1,'accountVault'))).outcome.status,'committed');assert.deepEqual(f.store.inspect(role),before);assert.equal(f.store.inspect(account).entries[0].permanentCount,1);
 assert.equal((await f.service.execute(f.transfer({kind:'equipment',itemId:item.id},1,'accountVault',true))).outcome.status,'committed');assert.deepEqual(f.store.inspect(role),before);assert.equal(f.store.inspect(account).entries[0].permanentCount,0);
});

test('each stage adds exactly20, account vault never expands, and wallet balances stay exact',async()=>{
 const f=await createBankFixture();await f.fund('18446744073709551615','100');for(let stage=1;stage<=4;stage++){const cmd=await f.expand();assert.equal((await f.service.execute(cmd)).outcome.status,'committed');assert.equal(f.bag().capacity,20+20*stage);}assert.equal(f.wallet().gold,'18446744073709550115');const q=await f.query('inventory.expansionQuote',{containerId:f.vault('accountVault').id,targetStage:1});assert.equal(q.error.code,'ITEM_NOT_ELIGIBLE');const skip=await f.query('inventory.expansionQuote',{containerId:f.vault().id,targetStage:2});assert.equal(skip.error.code,'UNLOCK_STAGE_MISMATCH');
});

test('orphan journal, wrong expected objects and current session revocation fail closed',async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('s',3)});const cmd=f.transfer({kind:'stack',stackId:'s'}),{j,o}=await f.keys(cmd.operationId);await f.store.run(tx=>tx.set(j,{id:j,existing:true}));assert.equal((await f.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE');assert.equal(f.store.inspect(o),undefined);
 const bad=f.transfer({kind:'stack',stackId:'s'});bad.expected.pop();assert.equal((await f.service.execute(bad)).outcome.code,'INVALID_ARGUMENT');const ok=f.transfer({kind:'stack',stackId:'s'});assert.equal((await f.service.execute(ok)).outcome.status,'committed');await f.store.run(tx=>tx.set(f.account().id,{...f.account(),currentSessionId:'replaced'}));assert.equal((await f.service.execute(ok)).outcome.code,'SESSION_REVOKED');
});

test('second-role isolation fixture shares only account vault, never other role private containers',async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('first-private',4)},'personalVault');await f.seed({0:f.stack('shared',7)},'accountVault');const second='isolated-second-role',bag='isolated-second-bag',vault='isolated-second-vault';
 // Storage isolation only, not a claim to implement hunter creation/gameplay.
 await f.store.run(tx=>{tx.set(second,{...f.character(),id:second,characterId:second,classId:'hunter',backpackId:bag,personalVaultId:vault,equipped:{}});tx.set(bag,{...f.bag(),id:bag,characterId:second,slots:{}});tx.set(vault,{...f.vault(),id:vault,characterId:second,slots:{}});tx.set(f.account().id,{...f.account(),selectedCharacterId:second,characterIdsByClass:{...f.account().characterIdsByClass,hunter:second}});});
 assert.equal((await f.query('bank.get',{vaultKind:'personalVault'})).error.code,'NOT_FOUND_OR_FORBIDDEN');assert.equal((await f.query('bank.get',{characterId:second,vaultKind:'personalVault'})).error.code,'CONTEXT_INVALID');
 const opened=await f.town.openService({...f.auth,command:'service.open',operationId:'second-bank-open',expected:[],payload:{characterId:second,serviceKind:'bank',anchorId:'bank'}});assert.equal(opened.outcome.status,'committed');const contextId=opened.outcome.data.contextId;
 const personal=await f.query('bank.get',{characterId:second,contextId,vaultKind:'personalVault'});assert.equal(personal.data.vault.slots.length,0);const shared=await f.query('bank.get',{characterId:second,contextId,vaultKind:'accountVault'});assert.equal(shared.data.vault.slots[0].entry.quantity,7);
 const q=await f.query('inventory.expansionQuote',{characterId:second,contextId,containerId:f.vault().id,targetStage:1});assert.equal(q.error.code,'NOT_FOUND_OR_FORBIDDEN');
});

for (const currency of ['gold','points']) test(`personal vault expands four stages with ${currency} and never charges past 100`,async()=>{
 const f=await createBankFixture();await f.fund('10000','100');const balances=currency==='gold'?['9850','9550','8950','7750']:['98','94','86','70'];let last;
 for(let stage=1;stage<=4;stage++){
  last=await f.expand('personalVault',currency);assert.equal((await f.service.execute(last)).outcome.status,'committed');
  const view=await f.query('bank.get',{vaultKind:'personalVault'});assert.equal(view.data.vault.capacity,[40,60,80,100][stage-1]);assert.equal(view.data.vault.unlockStage,stage);
  assert.equal(view.data.wallet[currency],balances[stage-1]);assert.equal(view.data.wallet[currency==='gold'?'points':'gold'],currency==='gold'?'100':'10000');
 }
 const before=f.store.snapshot();assert.equal((await f.query('inventory.expansionQuote',{containerId:f.vault().id,targetStage:4})).error.code,'UNLOCK_STAGE_MISMATCH');assert.deepEqual(f.store.snapshot(),before);
 assert.equal((await f.service.execute(last)).replayed,true);assert.deepEqual(f.store.snapshot(),before);
 const retry={...last,operationId:`exhausted-${currency}`,expected:[{kind:'character',id:f.characterId,version:f.character().version},{kind:'container',id:f.vault().id,version:f.vault().version},{kind:'wallet',id:f.wallet().id,version:f.wallet().version}]};
 const wallet=f.wallet(),vault=f.vault();assert.equal((await f.service.execute(retry)).outcome.code,'UNLOCK_STAGE_MISMATCH');assert.deepEqual(f.wallet(),wallet);assert.deepEqual(f.vault(),vault);
});

for(const first of ['deposit','withdraw'])test(`opposite equipment transfers serialize ${first} first and retry preserves both summaries`,async()=>{
 const f=await createBankFixture({holdingsDomain:domain}),outgoing=await seedEquipment(f,true),role=await seedHolding(f);
 const {loginKey}=await import('../src/identity/identity-v2.ts'),account=await loginKey('holdings',[f.account().id,'account']);
 const incoming={...structuredClone(outgoing),id:'incoming-gear',holderCharacterId:undefined,location:{kind:'container',containerId:f.vault('accountVault').id}};
 await f.store.run(async tx=>{tx.set(incoming.id,incoming);tx.set(f.vault('accountVault').id,{...f.vault('accountVault'),slots:{0:{kind:'equipment',itemId:incoming.id,sortHeader:{itemLevel:30,quality:'orange',slotKind:'weapon'}}}});const h=await tx.get(account);tx.set(account,{...h,entries:[{collectionKey:'warrior-set-weapon',permanentCount:1,mailLatestExpiryAt:null}]});});
 const cmds={deposit:f.transfer({kind:'equipment',itemId:outgoing.id},1,'accountVault'),withdraw:f.transfer({kind:'equipment',itemId:incoming.id},1,'accountVault',true)};
 let arrivals=0,ready,firstReady,releaseFirst,releaseSecond;const both=new Promise(r=>ready=r),firstArrived=new Promise(r=>firstReady=r),gate1=new Promise(r=>releaseFirst=r),gate2=new Promise(r=>releaseSecond=r);
 f.store.beforeCommit=async attempt=>{if(attempt!==0)return;const index=arrivals++;if(index===0)firstReady();if(arrivals===2)ready();await(index===0?gate1:gate2);};
 // Hashing before the transaction is asynchronous: explicitly bind a to gate1
 // before launching b. Both candidates still read the same uncommitted baseline.
 const other=first==='deposit'?'withdraw':'deposit',a=f.service.execute(cmds[first]);await firstArrived;const b=f.service.execute(cmds[other]);await both;releaseFirst();assert.equal((await a).outcome.status,'committed');releaseSecond();assert.equal((await b).outcome.code,'VERSION_CONFLICT');f.store.beforeCommit=undefined;assert.ok(f.store.conflicts>=1);
 const read=await f.query('bank.get',{vaultKind:'accountVault'});assert.equal(read.data.backpack.slots.length+read.data.vault.slots.length,2);
 const retry=f.transfer({kind:'equipment',itemId:other==='deposit'?outgoing.id:incoming.id},1,'accountVault',other==='withdraw');assert.equal((await f.service.execute(retry)).outcome.status,'committed');
 const final=await f.query('bank.get',{vaultKind:'accountVault'});assert.deepEqual(final.data.backpack.slots.map(s=>s.entry.itemId),[incoming.id]);assert.deepEqual(final.data.vault.slots.map(s=>s.entry.itemId),[outgoing.id]);
 assert.equal(f.store.inspect(role).entries[0].permanentCount,1);assert.equal(f.store.inspect(account).entries[0].permanentCount,1);assert.equal(f.store.inspect(role).entries[0].mailLatestExpiryAt,5000);
 for(const[item,container]of[[outgoing,final.data.vault],[incoming,final.data.backpack]])assert.deepEqual(f.store.inspect(item.id).location,{kind:'container',containerId:container.containerId});
});
