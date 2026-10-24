import { verifyTestRelease } from '../../../shared/src/config/release-v1.ts';
import type { TestAuthorization } from '../../../shared/src/config/release-v1.ts';
import type { ChallengeContent } from './challenge-model.ts';
/** Explicit local composition only: this verifier does not authorize production or fill missing levels. */
export async function entryContentFromE01(text: string, authorization: TestAuthorization, entry: {
    mapId: string;
    x: number;
    y: number;
    radius: number;
}): Promise<ChallengeContent> {
    const release = await verifyTestRelease(text, authorization);
    const dungeon = release.nodes.find(n => n.id === release.entryDungeonRef.id && n.version === release.entryDungeonRef.version && n.kind === 'dungeon')!;
    const rooms = dungeon.data.rooms as {spawns: {monsterRef:{id:string;version:number};role:string}[]}[];
    const ordinary = rooms[0].spawns.find(s=>s.role==='ordinary')!.monsterRef;
    const reward = dungeon.data.rewardRef as {
        id: string;
        version: number;
    };
    const content: ChallengeContent = { schemaVersion: 1, releaseRef: release.releaseId, profile: 'local-test', purpose: 'contract-fixture-only', release, dungeons: [{ dungeonId: 'first', kind: 'first', purpleTemplateRef:`${ordinary.id}@${ordinary.version}`, mapId: entry.mapId, anchor: { x: entry.x, y: entry.y, radius: entry.radius }, minLevel: 1, maxMonsterLevel: 15, difficulties: [{ difficultyId: 'normal', roomCost: 1, levels: { 1: { monsterStatsRef: `${dungeon.id}@${dungeon.version}`, equipmentSourceRef: `${reward.id}@${reward.version}` } } }] }] };
    function freeze(value: unknown): void { if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    } }
    freeze(content);
    return content;
}
