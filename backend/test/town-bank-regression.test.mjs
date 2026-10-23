import test from 'node:test';
import assert from 'node:assert/strict';
import { createBankFixture } from './fixtures/bank-fixture.mjs';
const read=(f,kind='accountVault',contextId=f.contextId)=>f.town.getInventory({...f.auth,query:'inventory.get',requestId:'legacy-bank',payload:{characterId:f.characterId,containerKind:kind,...(contextId?{contextId}:{})}});
test('legacy inventory account vault reads shared vault and public stack shape',async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('account-potion',8,{kind:'account',accountId:f.account().id})},'accountVault');
 const q=await read(f);assert.equal(q.data.containerId,f.vault('accountVault').id);assert.equal(q.data.kind,'accountVault');assert.equal(q.data.slots[0].entry.templateRef,'potion');assert.deepEqual(q.data.slots[0].entry.binding,{kind:'account'});
});
test('both vault kinds require bank context and reject mismatched context ownership or scene',async()=>{
 for(const kind of ['personalVault','accountVault']){
  const f=await createBankFixture();assert.equal((await read(f,kind,null)).error.code,'CONTEXT_INVALID');
  for(const change of [{accountId:'foreign'},{sceneEpoch:99},{rolePlayEpoch:99},{locationRevision:99},{anchorId:'absent'},{status:'closed'}]){
   const original=f.store.inspect(f.contextId);await f.store.run(tx=>tx.set(f.contextId,{...original,...change}));
   assert.equal((await read(f,kind)).error.code,'CONTEXT_INVALID');await f.store.run(tx=>tx.set(f.contextId,original));
  }
 }
});
test('legacy vault read fails closed when character leaves town or bank radius',async()=>{
 const f=await createBankFixture(),original=f.character();
 await f.store.run(tx=>tx.set(original.id,{...original,location:{kind:'inn',characterId:original.id}}));
 assert.equal((await read(f)).error.code,'CONTEXT_INVALID');
 await f.store.run(tx=>tx.set(original.id,{...original,townState:{...original.townState,position:{x:500,y:500}}}));
 assert.equal((await read(f)).error.code,'LOCATION_NOT_ALLOWED');
});
test('legacy inventory rejects stale current-session pointer and unselected roles',async()=>{
 const f=await createBankFixture(),account=f.account();
 await f.store.run(tx=>tx.set(account.id,{...account,currentSessionId:'replacement'}));
 assert.equal((await read(f,'backpack')).error.code,'SESSION_REVOKED');
 await f.store.run(tx=>tx.set(account.id,{...account,selectedCharacterId:'other'}));
 assert.equal((await read(f)).error.code,'NOT_FOUND_OR_FORBIDDEN');
});
test('backpack public projection strips internal account binding and template version object',async()=>{
 const f=await createBankFixture();await f.seed({0:f.stack('owned',2,{kind:'character',accountId:f.account().id,characterId:f.characterId})});
 const q=await read(f,'backpack',null);assert.equal(q.data.slots[0].entry.templateRef,'potion');assert.deepEqual(q.data.slots[0].entry.binding,{kind:'character',characterId:f.characterId});
});
