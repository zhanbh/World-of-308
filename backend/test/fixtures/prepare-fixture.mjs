import {readFile} from 'node:fs/promises';
import {createBankFixture} from './bank-fixture.mjs';
import {ChallengeService} from '../../src/challenge/challenge-service.ts';
import {entryContentFromE01} from '../../src/challenge/challenge-content.ts';
export async function prepareFixture(){
 const h=await createBankFixture();
 const content=await entryContentFromE01(await readFile(new URL('../../../shared/fixtures/warrior-first-normal.test.json',import.meta.url),'utf8'),{profileId:'warrior-e01-test',environmentScope:'local-test',allowTestStrategies:true},{mapId:h.town.manifest.mapId,x:100,y:100,radius:24});
 const service=new ChallengeService({store:h.store,clock:h.clock,identity:h.identity,content,encounterRandom:{nextRoom:()=>0},catalog:{'equipment:warrior-sword-white-v1':{templateId:'equipment:warrior-sword-white-v1',name:'Starter',slotKind:'weapon',itemLevel:10,quality:'white',allowedClasses:['warrior']}}});
 const entry=await service.query({...h.auth,query:'dungeon.entry',requestId:'entry',payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,dungeonId:'first'}});
 const started=await service.execute({...h.auth,command:'challenge.start',operationId:'start',expected:entry.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,dungeonId:'first',difficultyId:'normal',entryContext:entry.data.entryContext}});
 const challengeId=started.outcome.data.challengeId;
 const query=()=>service.query({...h.auth,query:'challenge.get',requestId:'state',payload:{challengeId}});
 const state=await query();
 const command={...h.auth,command:'challenge.prepareRoom',operationId:'prepare',expected:state.versions,payload:{characterId:h.characterId,rolePlayEpoch:h.character().rolePlayEpoch,challengeId,nextRoomNo:0,expectedRevision:0}};
 return {...h,content,service,challengeId,query,command};
}
