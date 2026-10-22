import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryPreview } from '../../client/tools/inventory-preview-server.mjs';
import { parseAssetQueryResponse } from '../../shared/src/protocol/asset-v2.ts';

test('isolated preview boots through real login/create/select and serves valid backpack and bindings', async () => {
  const demo = await createInventoryPreview();
  const identity = demo.bootstrap.identity;
  const request = (query, payload) => ({ protocolVersion: 2, sessionId: identity.sessionId, sessionEpoch: identity.sessionEpoch, requestId: `preview-${query}`, query, payload });
  const bag = parseAssetQueryResponse('inventory.get', await demo.rpc(request('inventory.get', {characterId:identity.characterId,containerKind:'backpack'})));
  assert.equal(bag.data.capacity,20); assert.equal(bag.data.slots.length,5);
  const quick = await demo.rpc(request('quickslot.get',{characterId:identity.characterId}));
  const assigned = await demo.rpc({ protocolVersion:2, sessionId:identity.sessionId, sessionEpoch:identity.sessionEpoch, operationId:'preview-assign',command:'quickslot.assign',expected:[{kind:'character',id:identity.characterId,version:quick.data.version}],payload:{characterId:identity.characterId,slotIndex:0,templateId:'item:hp-potion-small-v1'}});
  assert.equal(assigned.outcome.status,'committed');
  const after = await demo.rpc(request('quickslot.get',{characterId:identity.characterId}));
  assert.equal(after.data.slots[0].quantity,8);
  assert.equal(JSON.stringify(bag).includes('accountId'),false);
});

test('preview has distinct ephemeral storage namespaces and never exposes arbitrary asset commands',async()=>{
  const a=await createInventoryPreview(),b=await createInventoryPreview();
  assert.notEqual(a.bootstrap.previewInstanceId,b.bootstrap.previewInstanceId);
  await assert.rejects(()=>a.rpc({protocolVersion:2,sessionId:a.bootstrap.identity.sessionId,sessionEpoch:1,command:'shop.buy',operationId:'not-supported',expected:[],payload:{characterId:a.bootstrap.identity.characterId,contextId:'bank',offerId:'free',quantity:1,quoteRef:'free'}}),/UNSUPPORTED_COMMAND/);
});
