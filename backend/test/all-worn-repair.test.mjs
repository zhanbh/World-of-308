import test from 'node:test';
import assert from 'node:assert/strict';
import {allWornFixture,WEAR_SLOTS} from './fixtures/all-worn-repair-fixture.mjs';
test('all-worn quote and atomic repair include exactly seven worn wear slots and never backpack or vault gear',async()=>{
 const f=await allWornFixture(),before=f.character(),bag=f.store.inspect('all-worn-bag'),vault=f.store.inspect('all-worn-vault'),q=await f.quoteAll();
 assert.ok(!q.error,JSON.stringify(q));assert.equal(q.data.costs[0].amount,'240');assert.equal(q.data.repair.items.length,7);
 const result=await f.service.execute(f.allCommand(q));assert.equal(result.outcome.status,'committed',JSON.stringify(result));assert.equal(result.outcome.data.chargedGold,'240');assert.equal(f.wallet().gold,'760');
 for(const slot of WEAR_SLOTS){const item=f.store.inspect(f.character().equipped[slot]);assert.equal(item.durability.current,60);}
 for(const slot of ['bracelet','necklace','ring','subEquip','magicStone','trinket'])assert.equal(f.store.inspect(f.character().equipped[slot]).durability.current,null);
 assert.deepEqual(f.store.inspect('all-worn-bag'),bag);assert.deepEqual(f.store.inspect('all-worn-vault'),vault);assert.equal(f.character().statsVersion,before.statsVersion+1);assert.equal(f.character().equipmentVersion,before.equipmentVersion);assert.equal(f.character().score,before.score);assert.equal(f.character().scoreReachedAt,before.scoreReachedAt);
});

test('all-worn empty and full sets are free, exact funds suffice, and one missing gold refuses the entire batch',async()=>{
 for(const mode of ['empty','full','exact','short']){
  const f=await allWornFixture();
  if(mode==='empty')await f.store.run(async tx=>{const c=await tx.get(f.characterId);tx.set(c.id,{...c,equipped:{},version:c.version+1});});
  if(mode==='full')await f.store.run(async tx=>{for(const slot of WEAR_SLOTS){const i=await tx.get(f.character().equipped[slot]);tx.set(i.id,{...i,durability:{...i.durability,current:i.durability.max}});}});
  if(mode==='exact'||mode==='short')await f.fund(mode==='exact'?'240':'239');
  const q=await f.quoteAll();assert.ok(!q.error,JSON.stringify(q));assert.equal(q.data.repair.items.length,mode==='empty'?0:7);assert.equal(q.data.targetVersions.length,mode==='empty'?2:9);
  const c=f.character(),w=f.wallet(),items=WEAR_SLOTS.map(slot=>c.equipped[slot]).filter(Boolean).map(id=>f.store.inspect(id)),result=await f.service.execute(f.allCommand(q));
  if(mode==='short'){assert.equal(result.outcome.code,'CURRENCY_NOT_ENOUGH');assert.deepEqual(f.character(),c);assert.deepEqual(f.wallet(),w);for(const item of items)assert.deepEqual(f.store.inspect(item.id),item);}
  else{assert.equal(result.outcome.status,'committed',JSON.stringify(result));assert.equal(result.outcome.data.chargedGold,mode==='exact'?'240':'0');if(mode==='exact')assert.equal(f.wallet().gold,'0');else{assert.deepEqual(result.outcome.data.repairedItemIds,[]);assert.deepEqual(f.character(),c);assert.deepEqual(f.wallet(),w);for(const item of items)assert.deepEqual(f.store.inspect(item.id),item);}}
 }
});

import {RepairCoordinator} from '../../client/assets/scripts/net/RepairCoordinator.ts';
test('real transport all-worn coordinator shows the complete price and refreshes one confirmed batch',async()=>{
 const f=await allWornFixture(),saved=new Map(),client=new RepairCoordinator(f.transport,{load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)},()=> 'client-all-worn');
 client.init({...f.auth,characterId:f.characterId,rolePlayEpoch:f.character().rolePlayEpoch});await client.openAll(f.contextId);
 assert.equal(client.state.status,'ready',JSON.stringify(client.state));assert.equal(client.state.view.items.length,7);assert.equal(client.state.quote.costs[0].amount,'240');assert.equal(client.state.view.attributes.find(a=>a.statId==='attackPower').value,'240');
 await client.repair();assert.equal(client.state.status,'ready',JSON.stringify(client.state));assert.equal(client.state.view.wallet.gold,'760');assert.equal(client.state.view.attributes.find(a=>a.statId==='attackPower').value,'260');assert.ok(client.state.view.items.every(i=>i.durability.current===60));assert.equal(client.state.lastResult.repairedItemIds.length,7);assert.equal(saved.size,0);
});

import {RepairService} from '../src/repair/repair-service.ts';
import {REPAIR_TEST_CONFIG} from './fixtures/repair-fixture.mjs';
async function patch(f,id,change){await f.store.run(async tx=>tx.set(id,change(await tx.get(id))));}
function assets(f){return new Map([...f.store.snapshot()].filter(([id])=>!id.startsWith('v2:assetOp:')&&!id.startsWith('v2:assetJournal:')));}
test('late-target configuration and safe-version refusals never commit an early repaired prefix',async()=>{
 for(const mode of ['item-version','character-version','missing-price','price-changed','bad-last-target']){
  const f=await allWornFixture();let service=f.service;
  if(mode==='item-version')await patch(f,f.character().equipped.earring,i=>({...i,version:Number.MAX_SAFE_INTEGER}));
  if(mode==='character-version')await patch(f,f.characterId,c=>({...c,version:Number.MAX_SAFE_INTEGER}));
  const q=await f.quoteAll();assert.ok(!q.error,JSON.stringify(q));const command=f.allCommand(q);
  if(mode==='missing-price')service=new RepairService({store:f.store,clock:f.clock,identity:f.identity,config:{...REPAIR_TEST_CONFIG,prices:{}}});
  if(mode==='price-changed')service=new RepairService({store:f.store,clock:f.clock,identity:f.identity,config:{...REPAIR_TEST_CONFIG,ref:'changed-batch-prices',prices:{'10':{white:'2'}}}});
  if(mode==='bad-last-target')await patch(f,f.character().equipped.earring,i=>({...i,lifecycle:'destroyed',location:{kind:'retired',reason:'destroyed',sourceRef:'test-destroyed'}}));
  const before=assets(f),r=await service.execute(command);assert.equal(r.outcome.status,'rejected',JSON.stringify(r));assert.equal(r.outcome.code,mode==='bad-last-target'?'ITEM_NOT_ELIGIBLE':mode==='price-changed'?'QUOTE_CHANGED':'CONFIG_NOT_READY');assert.deepEqual(assets(f),before,mode);
 }
});

test('a quoted full-durability member and the complete worn target set remain version-bound',async()=>{
 const f=await allWornFixture();await patch(f,f.weaponId,i=>({...i,durability:{...i.durability,current:60}}));const q=await f.quoteAll();assert.equal(q.data.repair.items.length,7);assert.equal(q.data.repair.items.find(i=>i.itemId===f.weaponId).gold,'0');
 await patch(f,f.weaponId,i=>({...i,version:i.version+1}));const before=assets(f);assert.equal((await f.service.execute(f.allCommand(q))).outcome.code,'VERSION_CONFLICT');assert.deepEqual(assets(f),before);
});

test('maximum admitted UTF-8 equipment IDs and sixteen affixes per worn member survive the bounded public all-worn view',async()=>{
 const f=await allWornFixture(),wide=(prefix)=>prefix+'界'.repeat(128-prefix.length);
 await f.store.run(async tx=>{const c=await tx.get(f.characterId);for(const slot of WEAR_SLOTS){const old=await tx.get(c.equipped[slot]),id=wide(slot);c.equipped[slot]=id;tx.set(id,{...old,id,templateRef:{id:wide('template'),version:1},sourceKey:wide('source'),sourceLocator:{kind:'roomDrop',roomId:wide('room'),dropId:wide('drop')},setRef:{id:wide('set'),version:1},durability:{...old.durability,policyRef:wide('policy')},rolledAffixes:Array.from({length:16},(_,n)=>({stat:wide('stat'+n),value:Number.MAX_SAFE_INTEGER}))});}tx.set(c.id,{...c,version:c.version+1});});
 const request={...f.auth,query:'repair.get',requestId:'maximum-all-view',payload:{characterId:f.characterId,contextId:f.contextId,target:{kind:'allWorn'}}},view=await f.service.query(request);
 assert.ok(!view.error,JSON.stringify(view));assert.equal(view.data.items.length,7);assert.ok(view.data.items.every(i=>i.rolledAffixes.length===16));const bytes=new TextEncoder().encode(JSON.stringify(view)).length;assert.ok(bytes>65536);assert.ok(bytes<=131072);console.log('ST17-03 maximum admitted all-worn public UTF-8 bytes',bytes);
 const shaped=structuredClone(view),characterId=wide('character'),walletId=wide('wallet');shaped.requestId='R'.repeat(64);shaped.serverTime=Number.MAX_SAFE_INTEGER;Object.assign(shaped.data,{contextId:wide('context'),characterId,characterVersion:Number.MAX_SAFE_INTEGER,statsVersion:Number.MAX_SAFE_INTEGER});Object.assign(shaped.data.wallet,{walletId,version:Number.MAX_SAFE_INTEGER,gold:'18446744073709551615',points:'18446744073709551615'});
 for(const item of shaped.data.items){item.version=Number.MAX_SAFE_INTEGER;item.location.characterId=characterId;if(item.binding.kind==='character')item.binding.characterId=characterId;Object.assign(item.durability,{max:Number.MAX_SAFE_INTEGER,current:Number.MAX_SAFE_INTEGER-1});for(const affix of item.rolledAffixes)affix.value='18446744073709551615';}
 shaped.data.attributes=Array.from({length:32},(_,n)=>({statId:wide('attribute'+n),value:'18446744073709551615'}));shaped.versions=[{kind:'character',id:characterId,version:Number.MAX_SAFE_INTEGER},...shaped.data.items.map(i=>({kind:'equipment',id:i.itemId,version:i.version})),{kind:'wallet',id:walletId,version:Number.MAX_SAFE_INTEGER}];parseAssetQueryResponse('repair.get',shaped);const shapedBytes=new TextEncoder().encode(JSON.stringify(shaped)).length;assert.ok(shapedBytes<=131072);console.log('ST17-03 all-worn maximum scalar/UTF-8 codec-only shape bytes',shapedBytes);
 const traces=[],service=new RepairService({store:meter(f,traces),clock:f.clock,identity:f.identity,config:REPAIR_TEST_CONFIG}),quote=await f.quoteAll(),result=await service.execute(f.allCommand(quote));assert.equal(result.outcome.status,'committed',JSON.stringify(result));assert.equal(f.wallet().gold,'760');assert.equal(traces[0].W,12);assert.ok(traces[0].maxWrite<=131072);console.log('ST17-03 maximum admitted seven-item write UTF-8',JSON.stringify(traces[0]));

});

function meter(f,traces){return{run:fn=>f.store.run(async tx=>{const reads=new Set(),writes=[];let calls=0;const result=await fn({get:async id=>{calls++;reads.add(id);return tx.get(id);},set:(id,value)=>{calls++;writes.push({id,bytes:new TextEncoder().encode(JSON.stringify(value)).length});tx.set(id,value);}});traces.push({R:reads.size,W:new Set(writes.map(w=>w.id)).size,calls,setCalls:writes.length,bytes:writes.reduce((n,w)=>n+w.bytes,0),maxWrite:Math.max(0,...writes.map(w=>w.bytes)),responseBytes:new TextEncoder().encode(JSON.stringify(result)).length,writeKeys:writes.map(w=>w.id)});return result;})};}
test('every actual seven-target write rolls back atomically and its original result cannot charge twice',async()=>{
 const f=await allWornFixture(),q=await f.quoteAll(),traces=[],service=new RepairService({store:meter(f,traces),clock:f.clock,identity:f.identity,config:REPAIR_TEST_CONFIG}),command=f.allCommand(q);
 const queryTraces=[],readService=new RepairService({store:meter(f,queryTraces),clock:f.clock,identity:f.identity,config:REPAIR_TEST_CONFIG}),snapshot=f.store.snapshot();const view=await readService.query({...f.auth,query:'repair.get',requestId:'meter-all-view',payload:{characterId:f.characterId,contextId:f.contextId,target:{kind:'allWorn'}}});assert.ok(!view.error);assert.deepEqual(f.store.snapshot(),snapshot);assert.equal(queryTraces[0].W,0);assert.ok(queryTraces[0].R<=19);console.log('ST17-03 ordinary all-worn read view',JSON.stringify(queryTraces[0]));
 assert.equal((await service.execute(command)).outcome.status,'committed');const trace=traces[0];assert.equal(trace.setCalls,12);assert.ok(trace.R<=21&&trace.W===12&&trace.calls<=33);assert.ok(!trace.writeKeys.some(k=>k.includes('ranking')));console.log('ST17-03 all-worn actual transaction',JSON.stringify(trace));
 f.setNow(50000);const before=f.store.snapshot(),again=await f.service.execute(command);assert.equal(again.replayed,true);assert.equal(again.outcome.data.chargedGold,'240');assert.deepEqual(f.store.snapshot(),before);
 for(let at=1;at<=trace.setCalls;at++){const h=await allWornFixture(),quote=await h.quoteAll(),c=h.allCommand(quote),snapshot=h.store.snapshot();h.store.injectWriteFailure(at);assert.equal((await h.service.execute(c)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(h.store.snapshot(),snapshot,'set '+at);assert.equal((await h.service.execute(c)).outcome.status,'committed');assert.equal(h.wallet().gold,'760');}
});
async function orderedRace(f,first,second){let arrivals=0,enteredFirst,enteredBoth,releaseFirst,releaseSecond;const firstReady=new Promise(r=>enteredFirst=r),bothReady=new Promise(r=>enteredBoth=r),gate1=new Promise(r=>releaseFirst=r),gate2=new Promise(r=>releaseSecond=r);f.store.beforeCommit=async attempt=>{if(attempt!==0)return;const index=arrivals++;if(index===0)enteredFirst();if(arrivals===2)enteredBoth();await(index===0?gate1:gate2);};const a=first();await firstReady;const b=second();await bothReady;releaseFirst();const ar=await a;releaseSecond();const br=await b;f.store.beforeCommit=undefined;assert.ok(f.store.conflicts>=1);return[ar,br];}
test('real single repair and all-worn repair serialize in both OCC orders without a second debit',async()=>{
 for(const allFirst of [true,false]){const f=await allWornFixture(),all=f.allCommand(await f.quoteAll()),single=f.command(await f.quote(f.character().equipped.earring));const actions=[()=>f.service.execute(all),()=>f.service.execute(single)];if(!allFirst)actions.reverse();const [first,second]=await orderedRace(f,...actions);assert.equal(first.outcome.status,'committed');assert.equal(second.outcome.code,'VERSION_CONFLICT');assert.equal(f.wallet().gold,allFirst?'760':'970');assert.equal(f.store.inspect(f.character().equipped.earring).durability.current,60);assert.equal(f.store.inspect(f.weaponId).durability.current,allFirst?60:0);}
});
test('real equipment replacement and all-worn repair serialize in both OCC orders without silently repairing the new set',async()=>{
 for(const allFirst of [true,false]){const f=await allWornFixture(),all=f.allCommand(await f.quoteAll()),equip={...f.auth,command:'equipment.equip',operationId:'all-race-equip',expected:[{kind:'character',id:f.characterId,version:f.character().version},{kind:'container',id:f.bag().id,version:f.bag().version}],payload:{characterId:f.characterId,itemId:'all-worn-bag',targetSlot:'weapon'}};const actions=[()=>f.service.execute(all),()=>f.equipment.execute(equip)];if(!allFirst)actions.reverse();const [first,second]=await orderedRace(f,...actions);assert.equal(first.outcome.status,'committed',JSON.stringify(first));assert.equal(second.outcome.code,'VERSION_CONFLICT');assert.equal(f.wallet().gold,allFirst?'760':'1000');assert.equal(f.character().equipped.weapon,allFirst?f.weaponId:'all-worn-bag');assert.equal(f.store.inspect('all-worn-bag').durability.current,1);}
});
function clientFor(f,transport=f.transport,p={data:new Map(),load(k){return this.data.get(k)??null;},save(k,v){if(v===null)this.data.delete(k);else this.data.set(k,v);}}){const client=new RepairCoordinator(transport,p,()=> 'durable-all-worn');client.init({...f.auth,characterId:f.characterId,rolePlayEpoch:f.character().rolePlayEpoch});return{client,p};}
test('all-worn coordinator restores its same persisted original after a committed lost response and closure',async()=>{
 const f=await allWornFixture();let lose=true,sends=0;const transport={send:async text=>{const q=JSON.parse(text),r=await f.transport.send(text);if(q.command==='equipment.repair'){sends++;if(lose){lose=false;throw Error('lost batch response');}}return r;}};
 const {client,p}=clientFor(f,transport);await client.openAll(f.contextId);await client.repair();assert.equal(client.state.status,'unknown');assert.equal(f.wallet().gold,'760');client.close();const next=clientFor(f,transport,p).client;await next.openAll(f.contextId);assert.equal(next.state.status,'unknown');await next.recover();assert.equal(next.state.status,'ready');assert.equal(next.state.lastResult.chargedGold,'240');assert.equal(sends,1);assert.equal(p.data.size,0);assert.equal(f.wallet().gold,'760');
});
test('all-worn notFound preserves the original ID while a held late request races its retry',async()=>{
 const f=await allWornFixture();let held,calls=0;const transport={send:async text=>{const q=JSON.parse(text);if(q.command==='equipment.repair'&&++calls===1){held=text;throw Error('held batch');}return f.transport.send(text);}};
 const {client,p}=clientFor(f,transport);await client.openAll(f.contextId);await client.repair();assert.equal(client.state.status,'unknown');assert.equal(f.wallet().gold,'1000');await Promise.all([client.recover(),f.transport.send(held)]);assert.equal(client.state.status,'ready');assert.equal(client.state.lastResult.chargedGold,'240');assert.equal(f.wallet().gold,'760');assert.equal(p.data.size,0);assert.equal(JSON.parse(held).operationId,'durable-all-worn');
});

test('all-worn confirmation rejects stale refresh and retires callbacks after a character rebind',async()=>{
 const f=await allWornFixture();let stale=false,cached;const transport={send:async text=>{const q=JSON.parse(text);if(stale&&q.query==='repair.get')return JSON.stringify({...JSON.parse(cached),requestId:q.requestId});const r=await f.transport.send(text);if(q.query==='repair.get'&&!cached)cached=r;return r;}};
 const {client}=clientFor(f,transport);await client.openAll(f.contextId);stale=true;await client.repair();assert.equal(client.state.status,'failed');assert.equal(client.state.code,'STALE_REPAIR_VIEW');assert.equal(client.state.pendingOperationId,null);assert.equal(client.state.lastResult.chargedGold,'240');assert.equal(f.wallet().gold,'760');
 const h=await allWornFixture();let entered,release;const waiting=new Promise(r=>entered=r),hold={send:async text=>{const q=JSON.parse(text),result=await h.transport.send(text);if(q.command==='equipment.repair'){entered();await new Promise(r=>release=r);}return result;}};
 const next=clientFor(h,hold);await next.client.openAll(h.contextId);const old=next.client.repair();await waiting;next.client.close();next.client.init({...h.auth,characterId:'another-character',rolePlayEpoch:1});release();await old;assert.equal(next.client.state.status,'closed');assert.equal(next.client.state.view,null);assert.equal(next.p.data.size,1);assert.equal(h.wallet().gold,'760');
});

import {parseAssetQuery,parseAssetQueryResponse,decodeAssetResponse,parseEquipmentView} from '../../shared/src/protocol/asset-v2.ts';
test('all-worn public view and quote reject mixed scopes, duplicate or missing members and invalid envelopes',async()=>{
 const f=await allWornFixture(),request={...f.auth,query:'repair.get',requestId:'strict-all',payload:{characterId:f.characterId,contextId:f.contextId,target:{kind:'allWorn'}}};assert.deepEqual(parseAssetQuery(request),request);
 assert.throws(()=>parseAssetQuery({...request,payload:{...request.payload,itemId:f.weaponId}}));
 const view=await f.service.query(request),q=await f.quoteAll();assert.ok(!view.error);assert.ok(!q.error);
 for(const changed of [
  {...view,data:{...view.data,items:[...view.data.items,view.data.items[0]]}},
  {...view,data:{...view.data,items:view.data.items.slice(1)}},
  {...view,versions:view.versions.slice(1)},
  {...view,data:{...view.data,item:view.data.items[0]}},
  {...view,data:{...view.data,items:[{...view.data.items[0],location:{kind:'container',containerId:'bank'}},...view.data.items.slice(1)]}},
 ])assert.throws(()=>parseAssetQueryResponse('repair.get',changed));
 for(const changed of [
  {...q,data:{...q.data,repair:{...q.data.repair,items:[]}}},
  {...q,data:{...q.data,costs:[{currency:'gold',amount:'0'}],repair:{...q.data.repair,items:[]}}},
  {...q,data:{...q.data,costs:[{currency:'gold',amount:'239'}]}},
  {...q,data:{...q.data,repair:{...q.data.repair,items:[{...q.data.repair.items[0],missing:1},...q.data.repair.items.slice(1)]}}},
 ])assert.throws(()=>parseAssetQueryResponse('service.quote',changed));
 assert.throws(()=>decodeAssetResponse(request,' '.repeat(131073)));
 const legacy=await f.service.query({...request,payload:{characterId:f.characterId,contextId:f.contextId,itemId:f.weaponId}});assert.ok(!legacy.error);assert.equal(legacy.data.item.itemId,f.weaponId);assert.ok(!('items' in legacy.data));parseEquipmentView(legacy.data.item);
});

test('real sale of non-target backpack gear and all-worn repair serialize their shared wallet in both orders',async()=>{
 for(const allFirst of [true,false]){
  const f=await allWornFixture(),shopContext=await f.open('shop','shop'),repairContext=await f.open(),all=f.allCommand(await f.quoteAll(repairContext),repairContext),sell={...f.auth,command:'shop.sell',operationId:'all-race-sale',expected:[{kind:'character',id:f.characterId,version:f.character().version},{kind:'container',id:f.bag().id,version:f.bag().version},{kind:'wallet',id:f.wallet().id,version:f.wallet().version}],payload:{characterId:f.characterId,contextId:shopContext,target:{kind:'equipment',itemId:'all-worn-bag'},quantity:1,quoteRef:f.shop.catalog.quoteRef}};
  const actions=[()=>f.service.execute(all),()=>f.shop.execute(sell)];if(!allFirst)actions.reverse();const [first,second]=await orderedRace(f,...actions);assert.equal(first.outcome.status,'committed',JSON.stringify(first));assert.equal(second.outcome.code,'VERSION_CONFLICT');assert.equal(f.wallet().gold,allFirst?'760':'1100');assert.equal(f.store.inspect('all-worn-bag').lifecycle,allFirst?'active':'sold');assert.equal(f.store.inspect(f.weaponId).durability.current,allFirst?60:0);
 }
});
