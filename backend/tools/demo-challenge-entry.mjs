/** Repeatable ST10-01 local contract-fixture demo; no cloud, Cocos or battle activation. */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createBankFixture } from '../test/fixtures/bank-fixture.mjs';
import { EquipmentService } from '../src/equipment/equipment-service.ts';
import { ChallengeService } from '../src/challenge/challenge-service.ts';
import { entryContentFromE01 } from '../src/challenge/challenge-content.ts';
import { ChallengeEntryCoordinator } from '../../client/assets/scripts/net/ChallengeEntryCoordinator.ts';
const h = await createBankFixture(); // Actual LoginService, CharacterService and TownService.
const equipment = new EquipmentService({store:h.store,clock:h.clock,identity:h.identity});
const equipped = await equipment.query({...h.auth,query:'character.get',requestId:'demo-equipment',payload:{characterId:h.characterId}});
assert.ok('data' in equipped);
const content = await entryContentFromE01(await readFile(new URL('../../shared/fixtures/warrior-first-normal.test.json',import.meta.url),'utf8'),{profileId:'warrior-e01-test',environmentScope:'local-test',allowTestStrategies:true},{mapId:h.town.manifest.mapId,x:100,y:100,radius:24});
const service = new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content,catalog:{'equipment:warrior-sword-white-v1':{templateId:'equipment:warrior-sword-white-v1',name:'Starter sword',slotKind:'weapon',itemLevel:10,quality:'white',allowedClasses:['warrior']}}});
const pending = new Map();
const persistence = {load:key=>pending.get(key)??null,save:(key,value)=>value===null?pending.delete(key):pending.set(key,value)};
let loseStartReply = true;
const transport = {async send(text) {
 const request = JSON.parse(text);
 const response = await ('query' in request ? service.query(request) : service.execute(request));
 if ('command' in request && loseStartReply) { loseStartReply=false; throw new Error('demo lost committed response'); }
 return JSON.stringify(response);
}};
const identity = {sessionId:h.auth.sessionId,sessionEpoch:h.auth.sessionEpoch,characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch};
const client = new ChallengeEntryCoordinator(transport,persistence);
client.init(identity);
await client.open('first');
assert.equal(client.state.status,'choosing');
assert.equal(h.account().activeChallengeId,undefined);
console.log(JSON.stringify({step:'entry-selection',status:client.state.status,options:client.state.selection.options,challengeCreated:false}));
await client.confirm('normal','demo-start');
assert.equal(client.state.status,'unknown');
console.log(JSON.stringify({step:'explicit-confirmation',status:client.state.status,pendingOperationId:client.state.pendingOperationId}));
const reopened = new ChallengeEntryCoordinator(transport,persistence);
reopened.init(identity);
await reopened.retry();
assert.equal(reopened.state.status,'started');
assert.equal(pending.size,0);
console.log(JSON.stringify({step:'reload-original-intent',status:reopened.state.status,locked:reopened.state.started,firstRoomCharged:false,profile:content.purpose}));
