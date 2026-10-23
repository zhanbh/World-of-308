import test from 'node:test';
import assert from 'node:assert/strict';
import {createBankFixture} from './fixtures/bank-fixture.mjs';
import {InventoryService} from '../src/inventory/inventory-service.ts';
import {decodeAssetResponse} from '../../shared/src/protocol/asset-v2.ts';
import {loginKey} from '../src/identity/identity-v2.ts';
const bytes=v=>Buffer.byteLength(JSON.stringify(v),'utf8');
const maxId=s=>'"'.repeat(128-s.length)+s;
async function maxFixture(){
 const template=maxId('template'),catalog={[template]:{version:Number.MAX_SAFE_INTEGER,kind:'consumable',quickAssignable:true}};
 const f=await createBankFixture({catalog});
 const ids={account:maxId('account'),character:maxId('character'),bag:maxId('bag'),vault:maxId('vault'),wallet:maxId('wallet')};
 const replacements=new Map([[f.account().id,ids.account],[f.characterId,ids.character],[f.bag().id,ids.bag],[f.vault().id,ids.vault],[f.wallet().id,ids.wallet]]);
 const replace=v=>typeof v==='string'?(replacements.get(v)??v):Array.isArray(v)?v.map(replace):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)])):v;
 const snapshot=f.store.snapshot();await f.store.run(tx=>{for(const[k,v]of snapshot)tx.set(replacements.get(k)??k,replace(v));});
 const slots=prefix=>Object.fromEntries(Array.from({length:100},(_,i)=>[i,{kind:'stack',stackId:maxId(prefix+String(i).padStart(3,'0')),templateRef:{id:template,version:Number.MAX_SAFE_INTEGER},quantity:19,binding:{kind:'character',accountId:ids.account,characterId:ids.character},traceRef:maxId('trace'+prefix+i)}]));
 await f.store.run(async tx=>{for(const[id,prefix]of[[ids.bag,'b'],[ids.vault,'v']]){const v=await tx.get(id);tx.set(id,{...v,capacity:100,stage:4,slots:slots(prefix)});}});
 const query=(name,payload)=>f.service.query({...f.auth,query:name,requestId:'max-query',payload:{characterId:ids.character,contextId:f.contextId,...payload}});
 return{...f,ids,catalog,query};
}
test('maximum declared escaped IDs and bindings admit 100+100 slots through bank and inventory queries',async t=>{
 const f=await maxFixture(),b=f.store.inspect(f.ids.bag),v=f.store.inspect(f.ids.vault);
 t.diagnostic(`internal backpack=${bytes(b)} personal=${bytes(v)} bytes; fields are published ASCII128, not generated-key profile`);
 const result=await f.query('bank.get',{vaultKind:'personalVault'});
 assert.equal(result.error,undefined);assert.equal(result.data.backpack.slots.length,100);assert.equal(result.data.vault.slots.length,100);
 assert.deepEqual(decodeAssetResponse({...f.auth,query:'bank.get',requestId:'max-query',payload:{characterId:f.ids.character,contextId:f.contextId,vaultKind:'personalVault'}},JSON.stringify(result)),result);
 t.diagnostic(`public bank=${bytes(result)} bytes`);assert.ok(bytes(result)<=262144);
 const inventory=new InventoryService({store:f.store,clock:f.clock,identity:f.identity,catalog:f.catalog});
 const single=await inventory.query({...f.auth,query:'inventory.get',requestId:'max-single',payload:{characterId:f.ids.character,containerKind:'backpack'}});
 assert.deepEqual(decodeAssetResponse({...f.auth,query:'inventory.get',requestId:'max-single',payload:{characterId:f.ids.character,containerKind:'backpack'}},JSON.stringify(single)),single);
 assert.equal(single.error,undefined);assert.equal(single.data.slots.length,100);t.diagnostic(`public inventory=${bytes(single)} bytes`);
});
test('full 100-stack organize writes complete bounded lineage and bank transfer keeps its 128KiB journal',async t=>{
 const f=await maxFixture(),inventory=new InventoryService({store:f.store,clock:f.clock,identity:f.identity,catalog:f.catalog});
 const bag=f.store.inspect(f.ids.bag),c=f.store.inspect(f.ids.character);
 const result=await inventory.execute({...f.auth,command:'inventory.organize',operationId:'max-organize',expected:[{kind:'character',id:c.id,version:c.version},{kind:'container',id:bag.id,version:bag.version}],payload:{characterId:c.id,direction:'forward'}});
 assert.equal(result.outcome.status,'committed');
 const j=await loginKey('assetJournal',[f.ids.account,'max-organize']),journal=f.store.inspect(j);
 assert.equal(journal.changes.lineage.inputs.length,100);assert.equal(journal.changes.lineage.outputs.length,95);assert.equal(journal.changes.lineage.inputs.reduce((n,s)=>n+s.quantity,0),1900);assert.equal(journal.changes.lineage.outputs.reduce((n,s)=>n+s.quantity,0),1900);
 t.diagnostic(`organize journal=${bytes(journal)} bytes`);assert.ok(bytes(journal)<=524288);
 const s=f.store.inspect(f.ids.bag),v=f.store.inspect(f.ids.vault),target=Object.values(s.slots).find(x=>x.quantity===20);
 const moved=await f.service.execute({...f.auth,command:'inventory.transfer',operationId:'max-transfer',expected:[{kind:'character',id:c.id,version:c.version},{kind:'container',id:s.id,version:s.version},{kind:'container',id:v.id,version:v.version}],payload:{characterId:c.id,contextId:f.contextId,sourceContainerId:s.id,targetContainerId:v.id,target:{kind:'stack',stackId:target.stackId},quantity:20}});
 assert.equal(moved.outcome.status,'committed');const transferJournal=f.store.inspect(await loginKey('assetJournal',[f.ids.account,'max-transfer']));assert.equal(transferJournal.changes.lineage.inputs.length,21);assert.equal(transferJournal.changes.lineage.outputs.length,20);t.diagnostic(`bank transfer journal=${bytes(transferJournal)} bytes`);assert.ok(bytes(transferJournal)<=131072);
});
