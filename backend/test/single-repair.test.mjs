import test from 'node:test';
import assert from 'node:assert/strict';
import {repairFixture} from './fixtures/repair-fixture.mjs';
test('real blacksmith quote repairs a broken worn weapon with one exact charge and unchanged intrinsic facts',async()=>{
 const f=await repairFixture(),item=f.store.inspect(f.weaponId),c=f.character(),q=await f.quote();assert.ok(!q.error,JSON.stringify(q));assert.equal(q.data.repair.items[0].unitGold,'1');assert.equal(q.data.costs[0].amount,'60');
 const r=await f.service.execute(f.command(q));assert.equal(r.outcome.status,'committed',JSON.stringify(r));assert.equal(f.wallet().gold,'940');assert.equal(f.store.inspect(f.weaponId).durability.current,60);assert.equal(f.character().statsVersion,c.statsVersion+1);assert.equal(f.character().equipmentVersion,c.equipmentVersion);assert.equal(f.character().scoreReachedAt,c.scoreReachedAt);
 const changed=f.store.inspect(f.weaponId);for(const k of ['id','sourceKey','sourceLocator','rolledAffixes','binding','enhancementLevel','templateRef'])assert.deepEqual(changed[k],item[k]);
});

import {RepairCoordinator} from '../../client/assets/scripts/net/RepairCoordinator.ts';
test('real transport coordinator confirms quote then refreshes exact wallet, item and effective attributes',async()=>{
 const f=await repairFixture(),saved=new Map(),p={load:k=>saved.get(k)??null,save:(k,v)=>v===null?saved.delete(k):saved.set(k,v)},client=new RepairCoordinator(f.transport,p,()=> 'client-repair');
 client.init({...f.auth,characterId:f.characterId,rolePlayEpoch:f.character().rolePlayEpoch});await client.open(f.contextId,f.weaponId);assert.equal(client.state.status,'ready',JSON.stringify(client.state));assert.equal(client.state.view.attributes.find(a=>a.statId==='attackPower')?.value??'0','0');await client.repair();assert.equal(client.state.status,'ready',JSON.stringify(client.state));assert.equal(client.state.view.wallet.gold,'940');assert.equal(client.state.view.item.durability.current,60);assert.equal(client.state.view.attributes.find(a=>a.statId==='attackPower').value,'20');assert.equal(saved.size,0);
});

async function patch(f,id,change){await f.store.run(async tx=>tx.set(id,change(await tx.get(id))));}
async function bagItem(f,slot=0){const original=f.store.inspect(f.weaponId),id='admitted-repair-bag-'+slot;await f.store.run(async tx=>{const b=await tx.get(f.bag().id);tx.set(id,{...original,id,sourceKey:id,sourceLocator:{kind:'grant',grantId:id},holderCharacterId:f.characterId,binding:{kind:'none'},durability:{...original.durability,current:30},location:{kind:'container',containerId:b.id}});tx.set(b.id,{...b,version:b.version+1,slots:{...b.slots,[slot]:{kind:'equipment',itemId:id,sortHeader:{itemLevel:10,quality:'white',slotKind:'weapon'}}}});});return id;}
test('backpack single repair restores only the selected instance; full durability is free and does not write asset versions',async()=>{
 const f=await repairFixture(),id=await bagItem(f),old=f.character(),q=await f.quote(id),r=await f.service.execute(f.command(q));assert.equal(r.outcome.status,'committed');assert.equal(r.outcome.data.chargedGold,'30');assert.equal(f.wallet().gold,'970');assert.equal(f.store.inspect(id).durability.current,60);assert.equal(f.store.inspect(f.weaponId).durability.current,0);assert.equal(f.character().statsVersion,old.statsVersion);assert.equal(f.character().equipmentVersion,old.equipmentVersion);
 const full=await f.quote(id),item=f.store.inspect(id),wallet=f.wallet(),c=f.character();assert.equal(full.data.costs[0].amount,'0');const free=await f.service.execute(f.command(full));assert.equal(free.outcome.status,'committed');assert.deepEqual(free.outcome.data,{repairedItemIds:[],chargedGold:'0'});assert.deepEqual(f.wallet(),wallet);assert.deepEqual(f.store.inspect(id),item);assert.deepEqual(f.character(),c);
});
test('single repair rejects insufficient gold atomically and does not charge enhancement or affix premiums',async()=>{
 const f=await repairFixture();await patch(f,f.weaponId,i=>({...i,enhancementLevel:18,rolledAffixes:[{stat:'attackPower',value:999999}]}));const q=await f.quote();assert.equal(q.data.costs[0].amount,'60');await f.fund('59');const fresh=await f.quote(),w=f.wallet(),item=f.store.inspect(f.weaponId);const r=await f.service.execute(f.command(fresh));assert.equal(r.outcome.code,'CURRENCY_NOT_ENOUGH');assert.deepEqual(f.wallet(),w);assert.deepEqual(f.store.inspect(f.weaponId),item);
});
test('repair only accepts live owned wear slots in current equipped or backpack locations',async()=>{
 for(const change of [i=>({...i,location:{kind:'container',containerId:'personal-vault'}}),i=>({...i,holderCharacterId:'other-character'}),i=>({...i,binding:{kind:'character',accountId:i.accountId,characterId:'other-character'}}),i=>({...i,lifecycle:'destroyed'}),i=>({...i,slotKind:'ring',durability:{wearEnabled:false,current:null,max:null,policyRef:'none'}})]){
  const f=await repairFixture();await patch(f,f.weaponId,change);const before=f.store.snapshot(),r=await f.quote();assert.ok(r.error,JSON.stringify(r));assert.equal(r.error.code,'ITEM_NOT_ELIGIBLE');assert.deepEqual(f.store.snapshot(),before);
 }
 const f=await repairFixture(),q=await f.quote();const all={...f.command(q),payload:{...f.command(q).payload,target:{kind:'allWorn'}}};assert.equal((await f.service.execute(all)).outcome.code,'QUOTE_CHANGED');assert.equal(f.wallet().gold,'1000'); // A single quote cannot silently authorize the new all-worn selection.
});
test('quote expiration, close, same-place reopen and other service opening never revive an old repair quote',async()=>{
 for(const mode of ['equal-expiry','close','reopen','other-service','move']){
  const f=await repairFixture(),q=await f.quote(),cmd=f.command(q);
  if(mode==='equal-expiry')f.setNow(q.data.repair.expiresAt);
  if(mode==='close')await f.town.closeService({...f.auth,command:'service.close',operationId:'close',expected:[],payload:{characterId:f.characterId,contextId:f.contextId}});
  if(mode==='reopen')await f.open();
  if(mode==='other-service')await f.open('shop','shop');
  if(mode==='move')await f.town.move({...f.auth,command:'town.move',operationId:'walk-away',expected:[],payload:{characterId:f.characterId,steps:[{seq:f.character().townState.acceptedSeq+1,dx:100,dy:0,dtMs:1000}]}});
  const w=f.wallet(),r=await f.service.execute(cmd);assert.ok(['CONTEXT_INVALID','LOCATION_NOT_ALLOWED','VERSION_CONFLICT'].includes(r.outcome.code),mode+JSON.stringify(r));assert.deepEqual(f.wallet(),w);assert.equal(f.store.inspect(f.weaponId).durability.current,0);
 }
});
import {RepairService} from '../src/repair/repair-service.ts';
import {REPAIR_TEST_CONFIG} from './fixtures/repair-fixture.mjs';
test('quoted item, configuration and exact expected versions must still match; missing or invalid prices are refused',async()=>{
 const f=await repairFixture(),q=await f.quote(),cmd=f.command(q);await patch(f,f.weaponId,i=>({...i,version:i.version+1}));assert.equal((await f.service.execute(cmd)).outcome.code,'VERSION_CONFLICT');
 const h=await repairFixture(),price=await h.quote(),changed=new RepairService({store:h.store,clock:h.clock,identity:h.identity,config:{...REPAIR_TEST_CONFIG,ref:'new-config',prices:{'10':{white:'2'}}}});assert.equal((await changed.execute(h.command(price))).outcome.code,'QUOTE_CHANGED');assert.equal(h.wallet().gold,'1000');
 for(const config of [undefined,{...REPAIR_TEST_CONFIG,prices:{}},{...REPAIR_TEST_CONFIG,prices:{'10':{white:'00'}}}]){const s=new RepairService({store:h.store,clock:h.clock,identity:h.identity,config});const request={...h.auth,query:'service.quote',requestId:'bad-price',payload:{characterId:h.characterId,contextId:h.contextId,serviceIntent:{command:'equipment.repair',payload:{characterId:h.characterId,contextId:h.contextId,target:{kind:'single',itemId:h.weaponId},quoteRef:'none'}}}};assert.equal((await s.query(request)).error.code,'CONFIG_NOT_READY');}
});
test('committed originals survive lost response and expired context, while same ID with other arguments cannot charge again',async()=>{
 const f=await repairFixture(),q=await f.quote(),cmd=f.command(q);f.store.injectResponseLoss();assert.equal((await f.service.execute(cmd)).outcome.status,'unknown');assert.equal(f.wallet().gold,'940');f.setNow(50000);const original=await f.service.query({...f.auth,query:'operation.get',requestId:'original',payload:{operationId:cmd.operationId}});assert.equal(original.data.status,'found');assert.equal(original.data.result.outcome.status,'committed');assert.equal((await f.service.execute(cmd)).replayed,true);assert.equal((await f.service.execute({...cmd,payload:{...cmd.payload,quoteRef:'other'}})).outcome.code,'OPERATION_MISMATCH');assert.equal(f.wallet().gold,'940');
});
test('every actual repair write rolls back completely; quote/view budgets measure real reads and writes',async()=>{
 const sample=await repairFixture(),q=await sample.quote(),traces=[];
 const store={run:fn=>sample.store.run(async tx=>{const reads=new Set(),writes=[],gets=[];const r=await fn({get:async id=>{reads.add(id);gets.push(id);return tx.get(id);},set:(id,v)=>{writes.push({id,bytes:new TextEncoder().encode(JSON.stringify(v)).length});tx.set(id,v);}});traces.push({R:reads.size,W:new Set(writes.map(w=>w.id)).size,calls:gets.length+writes.length,setCalls:writes.length,bytes:writes.reduce((n,w)=>n+w.bytes,0),maxWrite:Math.max(0,...writes.map(w=>w.bytes)),writeKeys:writes.map(w=>w.id)});return r;})};
 const s=new RepairService({store,clock:sample.clock,identity:sample.identity,config:REPAIR_TEST_CONFIG});assert.equal((await s.execute(sample.command(q))).outcome.status,'committed');const trace=traces.find(t=>t.W>0);assert.equal(trace.setCalls,6);assert.ok(trace.R<=24&&trace.W<=6&&trace.calls<=40&&trace.maxWrite<131072);assert.ok(!trace.writeKeys.some(k=>k.includes('ranking')));console.log('ST17-02 single worn repair actual',JSON.stringify(trace));
 for(let at=1;at<=trace.setCalls;at++){const f=await repairFixture(),quote=await f.quote(),cmd=f.command(quote),before=f.store.snapshot();f.store.injectWriteFailure(at);assert.equal((await f.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE');assert.deepEqual(f.store.snapshot(),before);assert.equal((await f.service.execute(cmd)).outcome.status,'committed');assert.equal(f.wallet().gold,'940');}
});

async function orderedRace(f,first,second){
 let arrivals=0,enteredFirst,enteredBoth,releaseFirst,releaseSecond;
 const firstReady=new Promise(r=>enteredFirst=r),bothReady=new Promise(r=>enteredBoth=r),gate1=new Promise(r=>releaseFirst=r),gate2=new Promise(r=>releaseSecond=r);
 f.store.beforeCommit=async attempt=>{if(attempt!==0)return;const index=arrivals++;if(index===0)enteredFirst();if(arrivals===2)enteredBoth();await(index===0?gate1:gate2);};
 const a=first();await firstReady;const b=second();await bothReady;releaseFirst();const ar=await a;releaseSecond();const br=await b;f.store.beforeCommit=undefined;assert.ok(f.store.conflicts>=1);return [ar,br];
}
test('real equipment swap and single repair serialize in both OCC orders without repairing a replacement target',async()=>{
 for(const repairFirst of [true,false]){
  const f=await repairFixture(),id=await bagItem(f),q=await f.quote(id),repair=f.command(q),equip={...f.auth,command:'equipment.equip',operationId:'real-equip',expected:[{kind:'character',id:f.characterId,version:f.character().version},{kind:'container',id:f.bag().id,version:f.bag().version}],payload:{characterId:f.characterId,itemId:id,targetSlot:'weapon'}};
  const calls=[()=>f.service.execute(repair),()=>f.equipment.execute(equip)];if(!repairFirst)calls.reverse();const [a,b]=await orderedRace(f,...calls);assert.equal(a.outcome.status,'committed',JSON.stringify(a));assert.equal(b.outcome.code,'VERSION_CONFLICT',JSON.stringify(b));assert.equal(f.wallet().gold,repairFirst?'970':'1000');assert.equal(f.store.inspect(id).durability.current,repairFirst?60:30);assert.equal(f.character().equipped.weapon,repairFirst?f.weaponId:id);
 }
});
test('real shop sale and repair serialize in both OCC orders with one item lifecycle and no phantom debit',async()=>{
 for(const repairFirst of [true,false]){
  const f=await repairFixture(),id=await bagItem(f),shopContext=await f.open('shop','shop'),repairContext=await f.open(),q=await f.quote(id,repairContext),repair=f.command(q);repair.payload.contextId=repairContext;
  const sell={...f.auth,command:'shop.sell',operationId:'real-sell',expected:[{kind:'character',id:f.characterId,version:f.character().version},{kind:'container',id:f.bag().id,version:f.bag().version},{kind:'wallet',id:f.wallet().id,version:f.wallet().version}],payload:{characterId:f.characterId,contextId:shopContext,target:{kind:'equipment',itemId:id},quantity:1,quoteRef:f.shop.catalog.quoteRef}};
  const calls=[()=>f.service.execute(repair),()=>f.shop.execute(sell)];if(!repairFirst)calls.reverse();const [a,b]=await orderedRace(f,...calls);assert.equal(a.outcome.status,'committed',JSON.stringify(a));assert.ok(['VERSION_CONFLICT','ITEM_NOT_ELIGIBLE'].includes(b.outcome.code),JSON.stringify(b));assert.equal(f.store.inspect(id).lifecycle,repairFirst?'active':'sold');assert.ok(repairFirst?f.wallet().gold==='970':BigInt(f.wallet().gold)>1000n);
 }
});
test('repair service authenticates trusted identity and active character/session epochs, not payload ownership',async()=>{
 for(const mode of ['identity','session','role','selected']){
  const f=await repairFixture(),q=await f.quote(),cmd=f.command(q),before=f.wallet();
  if(mode==='identity')f.setSubject('unregistered-attacker');
  if(mode==='session')cmd.sessionEpoch++;
  if(mode==='role')await patch(f,f.characterId,c=>({...c,rolePlayEpoch:c.rolePlayEpoch+1}));
  if(mode==='selected')await patch(f,f.account().id,a=>({...a,selectedCharacterId:'other-character'}));
  const r=await f.service.execute(cmd);assert.equal(r.outcome.status,'rejected',JSON.stringify(r));assert.deepEqual(f.wallet(),before);assert.equal(f.store.inspect(f.weaponId).durability.current,0);
 }
});
test('replayed repair service.open cannot renew TTL or reactivate an old context; opening is atomic at each new write',async()=>{
 const f=await repairFixture(),ctx=f.store.inspect(f.contextId);f.setNow(5000);const replay=structuredClone(f.initialOpenRequest);
 const result=await f.town.openService(replay);assert.equal(result.replayed,true);assert.deepEqual(f.store.inspect(f.contextId),ctx);assert.equal((await f.quote()).data.repair.expiresAt,31000);await f.open();const current=f.character().currentServiceContextId;assert.equal((await f.town.openService(replay)).replayed,true);assert.equal(f.character().currentServiceContextId,current);
 for(const write of [1,2,3,4,5]){const h=await repairFixture(),before=h.store.snapshot();h.store.injectWriteFailure(write);await assert.rejects(h.open());assert.deepEqual(h.store.snapshot(),before);}
});
function persistence(){const data=new Map();return{data,load:k=>data.get(k)??null,save:(k,v)=>v===null?data.delete(k):data.set(k,v)};}
function clientFor(f,transport=f.transport,p=persistence(),op=()=> 'durable-single'){const c=new RepairCoordinator(transport,p,op);c.init({...f.auth,characterId:f.characterId,rolePlayEpoch:f.character().rolePlayEpoch});return{client:c,p};}
test('coordinator recovers committed lost response through original O even after closing and reattaching',async()=>{
 const f=await repairFixture();let lose=true,sends=0;const transport={send:async text=>{const q=JSON.parse(text),r=await f.transport.send(text);if(q.command==='equipment.repair'){sends++;if(lose){lose=false;throw Error('lost');}}return r;}};
 const {client,p}=clientFor(f,transport);await client.open(f.contextId,f.weaponId);await client.repair();assert.equal(client.state.status,'unknown');assert.equal(f.wallet().gold,'940');client.close();const next=clientFor(f,transport,p).client;await next.open(f.contextId,f.weaponId);assert.equal(next.state.status,'unknown');await next.recover();assert.equal(next.state.status,'ready');assert.equal(next.state.lastResult.chargedGold,'60');assert.equal(sends,1);assert.equal(p.data.size,0);assert.equal(f.wallet().gold,'940');
});
test('notFound keeps the same original ID; a held late commit racing retry can only charge once',async()=>{
 const f=await repairFixture();let held=null,calls=0;const transport={send:async text=>{const q=JSON.parse(text);if(q.command==='equipment.repair'&&++calls===1){held=text;throw Error('request held');}return f.transport.send(text);}};
 const {client,p}=clientFor(f,transport);await client.open(f.contextId,f.weaponId);await client.repair();assert.equal(client.state.status,'unknown');const original=JSON.parse(held);assert.equal(f.wallet().gold,'1000');
 // The original may still arrive after operation.get said notFound. Both use exactly one ID and tuple.
 await Promise.all([client.recover(),f.transport.send(held)]);assert.equal(client.state.status,'ready',JSON.stringify(client.state));assert.equal(client.state.lastResult.chargedGold,'60');assert.equal(f.wallet().gold,'940');assert.equal(original.operationId,'durable-single');assert.equal(p.data.size,0);
});
test('coordinator rejects stale refresh and retires delayed callbacks on close/rebind without cancelling assets',async()=>{
 const f=await repairFixture();let hold=false,entered,release;const waiting=new Promise(r=>entered=r),transport={send:async text=>{const q=JSON.parse(text),r=await f.transport.send(text);if(hold&&q.command==='equipment.repair'){hold=false;entered();await new Promise(r=>release=r);}return r;}};
 const {client,p}=clientFor(f,transport);await client.open(f.contextId,null);assert.equal(client.state.status,'empty');await client.open(f.contextId,f.weaponId);hold=true;const old=client.repair();await waiting;client.close();client.init({...f.auth,characterId:'other-character',rolePlayEpoch:1});release();await old;assert.equal(client.state.status,'closed');assert.equal(client.state.view,null);assert.equal(f.wallet().gold,'940');assert.equal(p.data.size,1);
 const h=await repairFixture();let stale=false,cached;const badTransport={send:async text=>{const q=JSON.parse(text);if(stale&&q.query==='repair.get')return JSON.stringify({...JSON.parse(cached),requestId:q.requestId});const r=await h.transport.send(text);if(q.query==='repair.get'&&!cached)cached=r;return r;}};const other=clientFor(h,badTransport).client;await other.open(h.contextId,h.weaponId);stale=true;await other.repair();assert.equal(other.state.status,'failed');assert.equal(other.state.code,'STALE_REPAIR_VIEW');assert.equal(other.state.pendingOperationId,null);assert.equal(other.state.lastResult.chargedGold,'60');assert.equal(h.wallet().gold,'940');
});

test('13-slot attributes and a 100-slot backpack stay bounded without repairing or charging non-targets',async()=>{
 const f=await repairFixture(),id=await bagItem(f,99),slots=['shoulder','chest','pants','belt','boots','earring','bracelet','necklace','ring','subEquip','magicStone','trinket'];
 await f.store.run(async tx=>{const c=await tx.get(f.characterId),w=await tx.get(f.weaponId),b=await tx.get(f.bag().id);for(const slot of slots){const gearId='max-repair-'+slot;c.equipped[slot]=gearId;const wears=['shoulder','chest','pants','belt','boots','earring'].includes(slot);tx.set(gearId,{...w,id:gearId,slotKind:slot,enhancementLevel:0,location:{kind:'equipped',characterId:c.id,slotId:slot},durability:wears?{...w.durability,current:30}:{wearEnabled:false,current:null,max:null,policyRef:'none'}});}tx.set(c.id,c);const entries={...b.slots};for(let i=0;i<99;i++)entries[i]={kind:'stack',stackId:'admitted-stack-'+i,templateRef:{id:'ore',version:1},quantity:20,binding:{kind:'none'},traceRef:'admitted-trace-'+i};tx.set(b.id,{...b,slots:entries,capacity:100,stage:4});});
 const traces=[],meter={run:fn=>f.store.run(async tx=>{const reads=new Set(),writes=[];let calls=0;const result=await fn({get:async k=>{calls++;reads.add(k);return tx.get(k);},set:(k,v)=>{calls++;writes.push({key:k,bytes:new TextEncoder().encode(JSON.stringify(v)).length});tx.set(k,v);}});traces.push({R:reads.size,W:new Set(writes.map(w=>w.key)).size,calls,bytes:writes.reduce((n,w)=>n+w.bytes,0),responseBytes:new TextEncoder().encode(JSON.stringify(result)).length});return result;})};
 const service=new RepairService({store:meter,clock:f.clock,identity:f.identity,config:REPAIR_TEST_CONFIG});
 const view=await service.query({...f.auth,query:'repair.get',requestId:'max-view',payload:{characterId:f.characterId,contextId:f.contextId,itemId:id}});assert.ok(!view.error);assert.equal(view.data.attributes.find(a=>a.statId==='attackPower').value,'240');assert.equal(traces[0].R,21);assert.ok(traces[0].responseBytes<65536);
 const q=await f.quote(id),before=f.store.inspect('max-repair-chest');assert.equal((await service.execute(f.command(q))).outcome.status,'committed');assert.deepEqual(f.store.inspect('max-repair-chest'),before);assert.equal(f.wallet().gold,'970');console.log('ST17-02 maximum local slots/one target',JSON.stringify(traces));
});

import {TownService} from '../src/town/town-service.ts';
test('repair-open original survives location revisions and closure, rejects tuple collisions, and is queryable after response loss',async()=>{
 const f=await repairFixture(),request=structuredClone(f.initialOpenRequest),ctx=f.store.inspect(f.contextId),original=await f.town.openService(request);
 await f.town.closeService({...f.auth,command:'service.close',operationId:'close-before-open-replay',expected:[],payload:{characterId:f.characterId,contextId:f.contextId}});
 for(const dx of [100,-100])await f.town.move({...f.auth,command:'town.move',operationId:'move-ctx-'+dx,expected:[],payload:{characterId:f.characterId,steps:[{seq:f.character().townState.acceptedSeq+1,dx,dy:0,dtMs:1000}]}});
 f.setNow(5000);const before=f.store.snapshot(),again=await f.town.openService(request);assert.equal(again.replayed,true);assert.deepEqual(again.outcome,original.outcome);assert.deepEqual(f.store.snapshot(),before);assert.equal(f.store.inspect(f.contextId).issuedAt,ctx.issuedAt);assert.equal(f.store.inspect(f.contextId).status,'closed');
 const mismatch=await f.town.openService({...request,payload:{...request.payload,anchorId:'other-anchor'}});assert.equal(mismatch.outcome.code,'OPERATION_MISMATCH');
 const newRequest={...request,operationId:'open-lost',expected:[{kind:'character',id:f.characterId,version:f.character().version}]};f.store.injectResponseLoss();assert.equal((await f.town.openService(newRequest)).outcome.status,'unknown');const found=await f.service.query({...f.auth,query:'operation.get',requestId:'open-original',payload:{operationId:'open-lost'}});assert.equal(found.data.status,'found');assert.equal(found.data.command,'service.open');assert.equal(found.data.result.outcome.status,'committed');
 const newContext=found.data.result.outcome.data.contextId,c=f.character(),active=f.store.inspect(newContext);f.setNow(6000);assert.equal((await f.town.openService(newRequest)).replayed,true);assert.deepEqual(f.character(),c);assert.deepEqual(f.store.inspect(newContext),active);
 const quote=await f.quote(f.weaponId,newContext),cmd=f.command(quote);cmd.operationId='open-lost';cmd.payload.contextId=newContext;assert.equal((await f.service.execute(cmd)).outcome.code,'OPERATION_MISMATCH');
});
test('new repair-open measures account/context/character/O/J writes through trusted identity and fails closed without it',async()=>{
 const f=await repairFixture(),traces=[],meter={run:fn=>f.store.run(async tx=>{const rkeys=new Set(),writes=[];let calls=0;const result=await fn({get:async id=>{calls++;rkeys.add(id);return tx.get(id);},set:(id,value)=>{calls++;writes.push({id,bytes:new TextEncoder().encode(JSON.stringify(value)).length});tx.set(id,value);}});traces.push({R:rkeys.size,W:new Set(writes.map(w=>w.id)).size,calls,bytes:writes.reduce((n,w)=>n+w.bytes,0)});return result;})};
 const town=new TownService({store:meter,clock:f.clock,identity:f.identity}),request={...f.auth,command:'service.open',operationId:'measured-open',expected:[{kind:'character',id:f.characterId,version:f.character().version}],payload:{characterId:f.characterId,serviceKind:'repair',anchorId:'blacksmith'}};assert.equal((await town.openService(request)).outcome.status,'committed');assert.equal(traces[0].W,5);assert.ok(traces[0].R<=8&&traces[0].calls<=14);console.log('ST17-02 repair-open actual',JSON.stringify(traces[0]));
 const noIdentity=new TownService({store:f.store,clock:f.clock});assert.equal((await noIdentity.openService({...request,operationId:'no-identity'})).outcome.code,'AUTH_REQUIRED');
});


test('repair-open rejects stale or missing character expectations without replacing the current service',async()=>{
 const f=await repairFixture(),c=f.character(),request={...f.auth,command:'service.open',operationId:'stale-repair-open',expected:[{kind:'character',id:c.id,version:c.version-1}],payload:{characterId:c.id,serviceKind:'repair',anchorId:'blacksmith'}};
 const oldContext=c.currentServiceContextId,r=await f.town.openService(request);assert.equal(r.outcome.code,'VERSION_CONFLICT');assert.deepEqual(f.character(),c);assert.equal(f.character().currentServiceContextId,oldContext);
 const absent=await f.town.openService({...request,operationId:'missing-repair-expected',expected:[]});assert.equal(absent.outcome.code,'INVALID_ARGUMENT');assert.deepEqual(f.character(),c);
 const wrong=await f.town.openService({...request,operationId:'wrong-repair-expected',expected:[{kind:'character',id:'other-character',version:c.version}]});assert.equal(wrong.outcome.code,'INVALID_ARGUMENT');assert.deepEqual(f.character(),c);
 const fresh={...request,operationId:'fresh-repair-expected',expected:[{kind:'character',id:c.id,version:c.version}]};assert.equal((await f.town.openService(fresh)).outcome.status,'committed');
 const after=f.store.snapshot();assert.equal((await f.town.openService(fresh)).replayed,true);assert.deepEqual(f.store.snapshot(),after);assert.equal((await f.town.openService({...fresh,expected:[{kind:'character',id:c.id,version:f.character().version}]})).outcome.code,'OPERATION_MISMATCH');
});

test('a held repair-open and a newer service serialize in both OCC orders without restoring the old service pointer',async()=>{
 for(const repairFirst of [true,false]){
  const f=await repairFixture(),c=f.character(),repair={...f.auth,command:'service.open',operationId:'held-repair-open',expected:[{kind:'character',id:c.id,version:c.version}],payload:{characterId:c.id,serviceKind:'repair',anchorId:'blacksmith'}},shop={...f.auth,command:'service.open',operationId:'newer-shop-open',expected:[{kind:'character',id:c.id,version:c.version}],payload:{characterId:c.id,serviceKind:'shop',anchorId:'shop'}};
  const calls=[()=>f.town.openService(repair),()=>f.town.openService(shop)];if(!repairFirst)calls.reverse();const [first,second]=await orderedRace(f,...calls);assert.equal(first.outcome.status,'committed');assert.equal(repairFirst?second.outcome.status:second.outcome.code,repairFirst?'committed':'VERSION_CONFLICT');
  const shopResult=repairFirst?second:first;assert.equal(f.character().currentServiceContextId,shopResult.outcome.data.contextId);assert.equal(f.store.inspect(f.character().currentServiceContextId).serviceKind,'shop');
 }
});
