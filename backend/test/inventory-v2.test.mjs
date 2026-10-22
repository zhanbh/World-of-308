import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/adapters/memory-store.ts';
import { createContextIdentityPort, loginKey } from '../src/identity/identity-v2.ts';
import { LoginService } from '../src/identity/login-service.ts';
import { CharacterService } from '../src/character/character-service.ts';
import { InventoryCoordinator } from '../../client/assets/scripts/net/InventoryCoordinator.ts';
import { InventoryService } from '../src/inventory/inventory-service.ts';

const catalog = { potion: {version:1,kind:'consumable',quickAssignable:true}, ore:{version:1,kind:'material',quickAssignable:false}, 'resurrection-emblem':{version:1,kind:'consumable',quickAssignable:false} };
async function fixture() {
  const store = new MemoryStore(), clock = { now: () => 1000 };
  let subject = 'player';
  const identity = createContextIdentityPort({appId:'app',environment:'test',sources:['minigame']},()=>({APPID:'app',ENV:'test',SOURCE:'minigame',OPENID:subject}));
  const login = new LoginService({store,clock,identity,ticketTtlMs:60000,initialUnlocks:{first:['normal']},holdingsDomainRef:'test-domain'});
  const prep = await login.execute({protocolVersion:2,command:'session.prepare',payload:{launchId:'launch',prepareOperationId:'prepare'}});
  const opened = await login.execute({protocolVersion:2,command:'session.commit',payload:{launchId:'launch',ticketId:prep.outcome.data.ticketId,openOperationId:'open'}});
  assert.equal(opened.outcome.status,'committed');
  const session = opened.outcome.data;
  const characters = new CharacterService({store,clock,initialProgressionRef:{id:'progression-warrior-v1',version:1},initialWeaponTemplateRef:{id:'equipment:warrior-sword-white-v1',version:1}});
  const envelope = {protocolVersion:2,sessionId:session.sessionId,sessionEpoch:session.sessionEpoch};
  const created = await characters.execute({...envelope,command:'character.create',operationId:'create',expected:[],payload:{classId:'warrior',characterName:'剑'}});
  assert.equal(created.outcome.status,'committed');
  const characterId = created.outcome.data.characterId;
  const selected = await characters.execute({...envelope,command:'character.select',operationId:'select',expected:[],payload:{characterId}});
  assert.equal(selected.outcome.status,'committed');
  const character = () => store.inspect(characterId);
  const bag = () => store.inspect(character().backpackId);
  const accountId = character().accountId;
  const service = new InventoryService({store,clock,identity,catalog});
  let serial=0;
  const command = (name='inventory.organize',payload={},expected) => ({...envelope,command:name,operationId:`inventory-${++serial}`,expected:expected ?? (name==='inventory.organize'?[{kind:'character',id:characterId,version:character().version},{kind:'container',id:bag().id,version:bag().version}]:[{kind:'character',id:characterId,version:character().version}]),payload:{characterId,...(name==='inventory.organize'?{direction:'forward'}:{slotIndex:0,templateId:'potion'}),...payload}});
  const query = (name='inventory.get',payload={}) => service.query({...envelope,query:name,requestId:`query-${++serial}`,payload:name==='operation.get'?payload:{characterId,...(name==='inventory.get'?{containerKind:'backpack'}:{}),...payload}});
  const seed = async (slots,capacity=20) => {
    // These are previously admitted reward-source journals, not a mock inventory service.
    await store.run(async tx => {
      for (const entry of Object.values(slots)) if(entry.kind==='stack') tx.set(entry.traceRef,{schemaVersion:2,id:entry.traceRef,accountId,characterId,command:'fixture.admittedReward',changes:{outputs:[structuredClone(entry)]}});
      tx.set(bag().id,{...bag(),slots,capacity,stage:capacity/20-1});
    });
  };
  const stack = (id,quantity=10,binding={kind:'none'},template='potion') => ({kind:'stack',stackId:id,templateRef:{id:template,version:1},quantity,binding,traceRef:`admitted:${id}`});
  const keys = async op => ({o:await loginKey('assetOp',[accountId,op]),j:await loginKey('assetJournal',[accountId,op])});
  return {store,service,character,bag,accountId,characterId,command,query,seed,stack,keys,envelope,setSubject:s=>{subject=s;}};
}

test('organize conserves each binding pool, compacts stacks, records lineage, and reverses full ordering',async()=>{
  const f=await fixture();
  await f.seed({2:f.stack('a',15),7:f.stack('b',12),9:f.stack('bound',4,{kind:'account',accountId:f.accountId}),11:f.stack('ore',5,{kind:'none'},'ore'),18:{kind:'equipment',itemId:'weapon-x',sortHeader:{itemLevel:10,quality:'white',slotKind:'weapon'}}});
  const before=f.bag(); const cmd=f.command(); const result=await f.service.execute(cmd);
  assert.equal(result.outcome.status,'committed'); assert.equal(result.outcome.data.mergedStacks,0);
  const slots=Object.values(f.bag().slots); assert.equal(slots[0].kind,'equipment'); assert.equal(slots.at(-1).templateRef.id,'ore');
  assert.deepEqual(slots.filter(s=>s.kind==='stack'&&s.binding.kind==='none'&&s.templateRef.id==='potion').map(s=>s.quantity),[20,7]);
  assert.equal(slots.find(s=>s.kind==='stack'&&s.binding.kind==='account').quantity,4);
  const {j}=await f.keys(cmd.operationId); const journal=f.store.inspect(j);
  assert.equal(journal.changes.lineage.inputs.length,2); assert.equal(journal.changes.lineage.outputs.length,2);
  assert.ok(journal.changes.lineage.outputs.every((s,i)=>s.traceRef===`${j}:${i}`));
  assert.equal(f.bag().version,before.version+1);
  const reversed=await f.service.execute(f.command('inventory.organize',{direction:'reverse'})); assert.equal(reversed.outcome.status,'committed');
  assert.equal(Object.keys(f.bag().slots)[0],'15'); assert.equal(Object.values(f.bag().slots)[0].templateRef.id,'ore');
});

test('merge reduces stack count and replay remains immutable after later version changes',async()=>{
  const f=await fixture(); await f.seed({1:f.stack('a',3),5:f.stack('b',4)});
  const cmd=f.command(); const first=await f.service.execute(cmd); assert.equal(first.outcome.data.mergedStacks,1);
  await f.service.execute(f.command('inventory.organize',{direction:'reverse'}));
  const snapshot=f.store.snapshot(); const replay=await f.service.execute(cmd);
  assert.equal(replay.replayed,true); assert.deepEqual(replay.outcome,first.outcome); assert.deepEqual(f.store.snapshot(),snapshot);
  const mismatch=await f.service.execute({...cmd,payload:{...cmd.payload,direction:'reverse'}}); assert.equal(mismatch.outcome.code,'OPERATION_MISMATCH');
});

test('exact expected set rejects missing/additional objects and persists refusal without journal',async()=>{
  const f=await fixture();
  for(const expected of [[],[{kind:'character',id:f.characterId,version:f.character().version}]]) {
    const cmd=f.command('inventory.organize',{},expected); const r=await f.service.execute(cmd); assert.equal(r.outcome.code,'INVALID_ARGUMENT');
    const {o,j}=await f.keys(cmd.operationId); assert.ok(f.store.inspect(o)); assert.equal(f.store.inspect(j),undefined);
    assert.equal((await f.service.execute(cmd)).replayed,true);
  }
  const cmd=f.command(); cmd.expected[1].version++; assert.equal((await f.service.execute(cmd)).outcome.code,'VERSION_CONFLICT');
});

test('orphan journal fails closed and operation queries isolate stored outcomes',async()=>{
  const f=await fixture(); assert.equal((await f.query('operation.get',{operationId:'missing'})).data.status,'notFound');
  const cmd=f.command(); const {j,o}=await f.keys(cmd.operationId); await f.store.run(tx=>tx.set(j,{id:j,sentinel:true}));
  assert.equal((await f.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE'); assert.equal(f.store.inspect(o),undefined); assert.equal(f.store.inspect(j).sentinel,true);
  const next=f.command(); const r=await f.service.execute(next); const found=await f.query('operation.get',{operationId:next.operationId}); assert.equal(found.data.status,'found'); assert.deepEqual(found.data.result,r);
});

for(const write of [1,2,3,4]) test(`organize write failure ${write} leaves no partial bag/account/journal/receipt`,async()=>{
  const f=await fixture(); await f.seed({5:f.stack('a',2),9:f.stack('b',3)}); const before=f.store.snapshot(); const cmd=f.command(); f.store.injectWriteFailure(write);
  assert.equal((await f.service.execute(cmd)).outcome.code,'SERVICE_UNAVAILABLE'); assert.deepEqual(f.store.snapshot(),before);
});

test('commit response loss is recovered by operation.get without applying intent twice',async()=>{
  const f=await fixture(); await f.seed({7:f.stack('a',2),8:f.stack('b',3)}); const cmd=f.command(); f.store.injectResponseLoss();
  assert.equal((await f.service.execute(cmd)).outcome.status,'unknown'); const snapshot=f.store.snapshot();
  const query=await f.query('operation.get',{operationId:cmd.operationId}); assert.equal(query.data.status,'found'); assert.equal(query.data.result.outcome.status,'committed');
  assert.equal((await f.service.execute(cmd)).replayed,true); assert.deepEqual(f.store.snapshot(),snapshot);
});

test('two concurrent intents with same bag version commit at most once',async()=>{
  const f=await fixture(); await f.seed({4:f.stack('a',2)}); const a=f.command(),b=f.command('inventory.organize',{direction:'reverse'});
  let arrivals=0,release; const barrier=new Promise(r=>{release=r;});
  f.store.beforeCommit=async attempt=>{if(attempt===0){if(++arrivals===2)release();await barrier;}};
  const results=await Promise.all([f.service.execute(a),f.service.execute(b)]); f.store.beforeCommit=undefined;
  assert.equal(results.filter(r=>r.outcome.status==='committed').length,1); assert.equal(results.filter(r=>r.outcome.code==='VERSION_CONFLICT').length,1);
});

test('quickslots reference templates, aggregate all bindings, retain zero then restore, and never consume',async()=>{
  const f=await fixture(); await f.seed({2:f.stack('a',3),7:f.stack('b',4,{kind:'account',accountId:f.accountId})});
  const before=f.bag(); const cmd=f.command('quickslot.assign'); assert.equal(cmd.expected.length,1); assert.equal((await f.service.execute(cmd)).outcome.status,'committed'); assert.deepEqual(f.bag(),before);
  assert.equal((await f.query('quickslot.get')).data.slots[0].quantity,7);
  await f.seed({}); assert.deepEqual((await f.query('quickslot.get')).data.slots[0],{slotIndex:0,templateId:'potion',quantity:0});
  assert.equal((await f.service.execute(f.command('quickslot.assign'))).outcome.status,'committed');
  await f.seed({9:f.stack('restored',2)}); assert.equal((await f.query('quickslot.get')).data.slots[0].quantity,2);
  for(const templateId of ['ore','resurrection-emblem','missing']) assert.equal((await f.service.execute(f.command('quickslot.assign',{templateId}))).outcome.code,'ITEM_NOT_ELIGIBLE');
  assert.equal((await f.service.execute(f.command('quickslot.assign',{templateId:null}))).outcome.status,'committed'); assert.equal((await f.query('quickslot.get')).data.slots[0].templateId,null);
});

test('identity, revoked session, and selected-character authorization fail closed',async()=>{
  const f=await fixture(); const cmd=f.command(); f.setSubject('foreign'); assert.equal((await f.service.execute(cmd)).outcome.code,'AUTH_REQUIRED'); assert.equal((await f.query()).error.code,'AUTH_REQUIRED');
  f.setSubject('player'); const original=f.store.inspect(f.accountId);
  await f.store.run(tx=>tx.set(f.accountId,{...original,selectedCharacterId:'other-character'})); assert.equal((await f.service.execute(f.command())).outcome.code,'NOT_FOUND_OR_FORBIDDEN');
  await f.store.run(tx=>tx.set(f.accountId,{...original,currentSessionId:'revoked'})); assert.equal((await f.service.execute(f.command())).outcome.code,'SESSION_REVOKED'); assert.equal((await f.query()).error.code,'SESSION_REVOKED');
});

test('100-slot public DTO stays bounded and redacts private account binding while preserving contracted trace pointers',async()=>{
  const f=await fixture(); await f.seed(Object.fromEntries(Array.from({length:100},(_,i)=>[i,f.stack(`stack-${i}`,20,{kind:'account',accountId:f.accountId})])),100);
  const response=await f.query(); assert.equal(response.data.slots.length,100);
  const wire=JSON.stringify(response); assert.ok(Buffer.byteLength(wire)<65536); assert.ok(!wire.includes(f.accountId)); assert.equal(response.data.slots[0].entry.traceRef,'admitted:stack-0'); assert.ok(!wire.includes('sourceTuple'));
  const cmd=f.command(); assert.equal((await f.service.execute(cmd)).outcome.status,'committed');
  const {j}=await f.keys(cmd.operationId); assert.ok(Buffer.byteLength(JSON.stringify(f.store.inspect(j)))<131072); assert.ok(Buffer.byteLength(JSON.stringify(f.bag()))<65536);
});


test('real coordinator wire path opens, assigns, organizes, and recovers committed unknown outcome',async()=>{
  const f=await fixture(); await f.seed({3:f.stack('a',3),9:f.stack('b',4)});
  const saved=new Map(), requests=[];
  const transport={send:async text=>{const request=JSON.parse(text); requests.push(request); return JSON.stringify('command' in request?await f.service.execute(request):await f.service.query(request));}};
  const coordinator=new InventoryCoordinator(transport,{load:k=>saved.get(k)??null,save:(k,v)=>{if(v===null)saved.delete(k);else saved.set(k,v);}});
  coordinator.init({sessionId:f.envelope.sessionId,sessionEpoch:f.envelope.sessionEpoch,characterId:f.characterId});
  await coordinator.open(); assert.equal(coordinator.state.status,'ready');
  await coordinator.assign('demo-assign',0,'potion'); assert.equal(coordinator.state.quickSlots.slots[0].quantity,7);
  f.store.injectResponseLoss(); await coordinator.organize('demo-organize','forward'); assert.equal(coordinator.state.status,'unknown'); assert.equal(saved.size,1);
  const version=f.bag().version; await coordinator.recover();
  assert.equal(coordinator.state.status,'ready'); assert.equal(coordinator.state.lastMergeCount,1); assert.equal(coordinator.state.backpack.slots.length,1);
  assert.equal(coordinator.state.quickSlots.slots[0].quantity,7); assert.equal(f.bag().version,version); assert.equal(saved.size,0);
  assert.equal(requests.filter(r=>r.command==='inventory.organize').length,1); assert.ok(requests.some(r=>r.query==='operation.get'));
});

test('quickslot accepts character-only expectation and rejects foreign container expectations or invalid indices before mutation',async()=>{
  const f=await fixture(); await f.seed({0:f.stack('p',2)});
  const extra=f.command('quickslot.assign',{},[{kind:'character',id:f.characterId,version:f.character().version},{kind:'container',id:f.bag().id,version:f.bag().version}]);
  assert.equal((await f.service.execute(extra)).outcome.code,'INVALID_ARGUMENT');
  const before=f.store.snapshot();
  for(const slotIndex of [-1,3,0.5]) await assert.rejects(f.service.execute(f.command('quickslot.assign',{slotIndex})),TypeError);
  assert.deepEqual(f.store.snapshot(),before);
  const wrong=f.command(); wrong.sessionId='foreign-session'; assert.equal((await f.service.execute(wrong)).outcome.code,'SESSION_REVOKED');
  const foreign=f.command('inventory.organize',{characterId:'foreign-character'}); assert.equal((await f.service.execute(foreign)).outcome.code,'NOT_FOUND_OR_FORBIDDEN');
});

test('quickslot replay and concurrent organize leave template selection and total quantity consistent',async()=>{
  const f=await fixture(); await f.seed({0:f.stack('a',2),8:f.stack('b',3)});
  const assign=f.command('quickslot.assign'),organize=f.command();
  const results=await Promise.all([f.service.execute(assign),f.service.execute(organize)]);
  assert.equal(results[0].outcome.status,'committed');
  assert.ok(results[1].outcome.status==='committed'||results[1].outcome.code==='VERSION_CONFLICT');
  const before=f.store.snapshot(); assert.equal((await f.service.execute(assign)).replayed,true); assert.deepEqual(f.store.snapshot(),before);
  const mismatch={...assign,payload:{...assign.payload,templateId:null}}; assert.equal((await f.service.execute(mismatch)).outcome.code,'OPERATION_MISMATCH');
  const view=await f.query('quickslot.get'); assert.equal(view.data.slots[0].templateId,'potion'); assert.equal(view.data.slots[0].quantity,5);
});

for(const write of [1,2,3,4]) test(`quickslot write failure ${write} leaves no partial selection/account/journal/receipt`,async()=>{
  const f=await fixture(); await f.seed({1:f.stack('p',3)}); const before=f.store.snapshot(); f.store.injectWriteFailure(write);
  assert.equal((await f.service.execute(f.command('quickslot.assign'))).outcome.code,'SERVICE_UNAVAILABLE'); assert.deepEqual(f.store.snapshot(),before);
});

test('strict public command boundaries reject forged authority and oversized or malformed envelopes before writes',async()=>{
  const f=await fixture(), valid=f.command(), before=f.store.snapshot();
  for(const command of [
    {...valid,accountId:f.accountId},
    {...valid,payload:{...valid.payload,quantity:99}},
    {...valid,expected:[...valid.expected,valid.expected[0]]},
    {...valid,payload:{...valid.payload,direction:'sideways'}},
    {...valid,operationId:'x'.repeat(1000)},
    {...valid,sessionEpoch:0},
  ]) await assert.rejects(f.service.execute(command),TypeError);
  assert.deepEqual(f.store.snapshot(),before);
});

test('single organize uses seven keyed reads and four atomic writes without equipment or ancestry scans',async()=>{
  const f=await fixture(); await f.seed({2:f.stack('a',2),7:f.stack('b',3)});
  const originalRun=f.store.run.bind(f.store),reads=[],writes=[];
  f.store.run=work=>originalRun(tx=>work({get:async id=>{reads.push(id);return tx.get(id);},set:(id,value)=>{writes.push(id);tx.set(id,value);}}));
  const command=f.command(); assert.equal((await f.service.execute(command)).outcome.status,'committed');
  assert.equal(reads.length,7); assert.equal(new Set(reads).size,7); assert.equal(writes.length,4); assert.equal(new Set(writes).size,4);
  assert.ok(!reads.some(id=>id.startsWith('admitted:')));
  const keys=await f.keys(command.operationId); assert.deepEqual(new Set(writes),new Set([f.bag().id,f.accountId,keys.j,keys.o]));
});

test('an original request still in flight and its exact retry share one receipt and one asset change', async () => {
  const f = await fixture(); await f.seed({0:f.stack('a',2),1:f.stack('b',3)});
  const command = f.command(); const beforeVersion = f.bag().version;
  let count = 0, release; const barrier = new Promise(resolve => { release = resolve; });
  f.store.beforeCommit = async attempt => { if (attempt === 0) { if (++count === 2) release(); await barrier; } };
  const results = await Promise.all([f.service.execute(command), f.service.execute(structuredClone(command))]);
  f.store.beforeCommit = undefined;
  assert.ok(results.every(r => r.outcome.status === 'committed'));
  assert.equal(results.filter(r => r.replayed).length, 1);
  assert.equal(f.bag().version, beforeVersion + 1);
  assert.equal(Object.values(f.bag().slots).reduce((sum,s) => sum + s.quantity,0),5);
});
