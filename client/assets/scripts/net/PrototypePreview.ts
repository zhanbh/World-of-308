import { RepairCoordinator } from './RepairCoordinator.ts';
import { EnhancementCoordinator } from './EnhancementCoordinator.ts';
import { RankingCoordinator, type RankingIdentity, type RankingItemView } from './RankingCoordinator.ts';
import type { EquipmentView, AssetQuery, AssetQueryResponse } from '../../../../shared/src/protocol/asset-v2.ts';
import { time, type Time } from '../../../../shared/src/exact-values.ts';

export const PROTOTYPE_LABELS: Record<string, string> = {
  'wpn-epic-katana': '无影剑-艾雷诺',
  'arm-epic-shoulder': '千莲缠腰锁肩',
  'arm-epic-chest': '天界骑士战铠',
  'arm-epic-pants': '战意咆哮绑腿',
  'arm-epic-belt': '巨力泰坦护腰',
  'arm-epic-boots': '疾风追影重靴',
  'acc-epic-earring': '黑珍珠-米奈',
  'mat-carbon': '炉岩碳',
};

export function createSandboxRepairCoordinator(): { coordinator: RepairCoordinator; contextId: string; labels: Record<string, string> } {
  const contextId = 'sandbox-repair-context';
  const characterId = 'warrior-player-1';
  const persistence = {
    load: (_k: string) => null,
    save: (_k: string, _v: string | null) => {},
  };

  const wornItems: EquipmentView[] = [
    {
      itemId: 'item-sandbox-weapon',
      version: 1,
      templateRef: 'wpn-epic-katana',
      slotKind: 'weapon',
      itemLevel: 30,
      quality: 'purple',
      rolledAffixes: [],
      setRef: undefined,
      enhancementLevel: 10,
      enhancementBonus: { configRef: 'v1', level: 10, attackPower: '1250' },
      binding: { kind: 'character', characterId },
      durability: { wearEnabled: true, current: 0, max: 35, policyRef: 'default' },
      location: { kind: 'equipped', characterId, slotId: 'weapon' },
      lifecycle: 'active',
      source: { kind: 'initialEquip', characterId },
    },
    {
      itemId: 'item-sandbox-shoulder',
      version: 1,
      templateRef: 'arm-epic-shoulder',
      slotKind: 'shoulder',
      itemLevel: 30,
      quality: 'purple',
      rolledAffixes: [],
      setRef: undefined,
      enhancementLevel: 0,
      enhancementBonus: undefined,
      binding: { kind: 'character', characterId },
      durability: { wearEnabled: true, current: 14, max: 30, policyRef: 'default' },
      location: { kind: 'equipped', characterId, slotId: 'shoulder' },
      lifecycle: 'active',
      source: { kind: 'initialEquip', characterId },
    },
    {
      itemId: 'item-sandbox-chest',
      version: 1,
      templateRef: 'arm-epic-chest',
      slotKind: 'chest',
      itemLevel: 30,
      quality: 'purple',
      rolledAffixes: [],
      setRef: undefined,
      enhancementLevel: 0,
      enhancementBonus: undefined,
      binding: { kind: 'character', characterId },
      durability: { wearEnabled: true, current: 18, max: 35, policyRef: 'default' },
      location: { kind: 'equipped', characterId, slotId: 'chest' },
      lifecycle: 'active',
      source: { kind: 'initialEquip', characterId },
    },
    {
      itemId: 'item-sandbox-pants',
      version: 1,
      templateRef: 'arm-epic-pants',
      slotKind: 'pants',
      itemLevel: 30,
      quality: 'purple',
      rolledAffixes: [],
      setRef: undefined,
      enhancementLevel: 0,
      enhancementBonus: undefined,
      binding: { kind: 'character', characterId },
      durability: { wearEnabled: true, current: 10, max: 35, policyRef: 'default' },
      location: { kind: 'equipped', characterId, slotId: 'pants' },
      lifecycle: 'active',
      source: { kind: 'initialEquip', characterId },
    },
    {
      itemId: 'item-sandbox-belt',
      version: 1,
      templateRef: 'arm-epic-belt',
      slotKind: 'belt',
      itemLevel: 30,
      quality: 'purple',
      rolledAffixes: [],
      setRef: undefined,
      enhancementLevel: 0,
      enhancementBonus: undefined,
      binding: { kind: 'character', characterId },
      durability: { wearEnabled: true, current: 25, max: 30, policyRef: 'default' },
      location: { kind: 'equipped', characterId, slotId: 'belt' },
      lifecycle: 'active',
      source: { kind: 'initialEquip', characterId },
    },
    {
      itemId: 'item-sandbox-boots',
      version: 1,
      templateRef: 'arm-epic-boots',
      slotKind: 'boots',
      itemLevel: 30,
      quality: 'purple',
      rolledAffixes: [],
      setRef: undefined,
      enhancementLevel: 0,
      enhancementBonus: undefined,
      binding: { kind: 'character', characterId },
      durability: { wearEnabled: true, current: 15, max: 30, policyRef: 'default' },
      location: { kind: 'equipped', characterId, slotId: 'boots' },
      lifecycle: 'active',
      source: { kind: 'initialEquip', characterId },
    },
    {
      itemId: 'item-sandbox-earring',
      version: 1,
      templateRef: 'acc-epic-earring',
      slotKind: 'earring',
      itemLevel: 30,
      quality: 'purple',
      rolledAffixes: [],
      setRef: undefined,
      enhancementLevel: 12,
      enhancementBonus: { configRef: 'v1', level: 12, attackPower: '680' },
      binding: { kind: 'character', characterId },
      durability: { wearEnabled: true, current: 22, max: 35, policyRef: 'default' },
      location: { kind: 'equipped', characterId, slotId: 'earring' },
      lifecycle: 'active',
      source: { kind: 'initialEquip', characterId },
    },
  ];

  const transport = {
    send: async (text: string): Promise<string> => {
      const msg = JSON.parse(text);
      if (msg.query === 'repair.get') {
        const target = msg.payload?.target;
        if (target?.kind === 'allWorn') {
          return JSON.stringify({
            kind: 'repair.get',
            requestId: msg.requestId,
            versions: [{ kind: 'character', id: characterId, version: 1 }],
            data: {
              contextId,
              characterId,
              characterVersion: 1,
              statsVersion: 1,
              target: { kind: 'allWorn' },
              items: wornItems,
              wallet: { walletId: 'w1', version: 1, gold: '1000000', points: '100' },
              attributes: [],
            },
          });
        }
        const single = wornItems.find(i => i.itemId === msg.payload?.itemId) ?? wornItems[0];
        return JSON.stringify({
          kind: 'repair.get',
          requestId: msg.requestId,
          versions: [{ kind: 'character', id: characterId, version: 1 }],
          data: {
            contextId,
            characterId,
            characterVersion: 1,
            statsVersion: 1,
            item: single,
            wallet: { walletId: 'w1', version: 1, gold: '1000000', points: '100' },
            attributes: [],
          },
        });
      }
      if (msg.query === 'service.quote') {
        const target = msg.payload?.serviceIntent?.payload?.target;
        if (target?.kind === 'allWorn') {
          const quoteItems = wornItems.map(item => {
            const cur = item.durability.current ?? 0;
            const max = item.durability.max ?? 1;
            const missing = Math.max(0, max - cur);
            return {
              itemId: item.itemId,
              current: cur,
              max,
              missing,
              gold: String(missing * 40),
              unitGold: '40',
            };
          });
          const totalGold = String(quoteItems.reduce((sum, qi) => sum + Number(qi.gold), 0));
          return JSON.stringify({
            kind: 'service.quote',
            requestId: msg.requestId,
            versions: [{ kind: 'character', id: characterId, version: 1 }],
            data: {
              serviceKind: 'repair',
              quoteRef: 'sandbox-quote-repair',
              characterId,
              contextId,
              targetVersions: [{ kind: 'character', id: characterId, version: 1 }],
              repair: {
                target: { kind: 'allWorn' },
                expiresAt: Date.now() + 60000,
                items: quoteItems,
                totalGold,
              },
              serverTime: Date.now(),
            },
          });
        }
        const single = wornItems.find(i => i.itemId === target?.itemId) ?? wornItems[0];
        const cur = single.durability.current ?? 0;
        const max = single.durability.max ?? 1;
        const missing = Math.max(0, max - cur);
        return JSON.stringify({
          kind: 'service.quote',
          requestId: msg.requestId,
          versions: [{ kind: 'character', id: characterId, version: 1 }],
          data: {
            serviceKind: 'repair',
            quoteRef: 'sandbox-quote-repair',
            characterId,
            contextId,
            targetVersions: [{ kind: 'character', id: characterId, version: 1 }],
            repair: {
              target: { kind: 'single', itemId: single.itemId },
              expiresAt: Date.now() + 60000,
              items: [{ itemId: single.itemId, current: cur, max, missing, gold: String(missing * 40), unitGold: '40' }],
              totalGold: String(missing * 40),
            },
            serverTime: Date.now(),
          },
        });
      }
      if (msg.command === 'equipment.repair') {
        const target = msg.payload?.target;
        const repairedIds: string[] = [];
        if (target?.kind === 'allWorn') {
          for (const item of wornItems) {
            if (item.durability.wearEnabled) {
              item.durability.current = item.durability.max;
              repairedIds.push(item.itemId);
            }
          }
        } else {
          const item = wornItems.find(i => i.itemId === target?.itemId);
          if (item?.durability.wearEnabled) {
            item.durability.current = item.durability.max;
            repairedIds.push(item.itemId);
          }
        }
        return JSON.stringify({
          operationId: msg.operationId,
          outcome: {
            status: 'success',
            data: { repairedItemIds: repairedIds, chargedGold: '4800' },
            resultVersions: [{ kind: 'character', id: characterId, version: 2 }],
          },
        });
      }
      return JSON.stringify({ status: 'ok' });
    },
  };

  const coordinator = new RepairCoordinator(transport, persistence, () => `repair-${Date.now().toString(36)}`);
  coordinator.init({ sessionId: 'sandbox-session', sessionEpoch: 1, characterId, rolePlayEpoch: 1 });
  return { coordinator, contextId, labels: PROTOTYPE_LABELS };
}

export function createSandboxEnhancementCoordinator(): { coordinator: EnhancementCoordinator; contextId: string; labels: Record<string, string> } {
  const contextId = 'sandbox-enhancement-context';
  const characterId = 'warrior-player-1';
  const persistence = {
    load: (_k: string) => null,
    save: (_k: string, _v: string | null) => {},
  };

  const weapon: EquipmentView = {
    itemId: 'item-sandbox-weapon',
    version: 1,
    templateRef: 'wpn-epic-katana',
    slotKind: 'weapon',
    itemLevel: 30,
    quality: 'purple',
    rolledAffixes: [],
    setRef: undefined,
    enhancementLevel: 10,
    enhancementBonus: { configRef: 'v1', level: 10, attackPower: '1250' },
    binding: { kind: 'character', characterId },
    durability: { wearEnabled: true, current: 35, max: 35, policyRef: 'default' },
    location: { kind: 'equipped', characterId, slotId: 'weapon' },
    lifecycle: 'active',
    source: { kind: 'initialEquip', characterId },
  };

  const transport = {
    send: async (text: string): Promise<string> => {
      const msg = JSON.parse(text);
      if (msg.query === 'enhancement.get') {
        return JSON.stringify({
          kind: 'enhancement.get',
          requestId: msg.requestId,
          versions: [{ kind: 'character', id: characterId, version: 1 }],
          data: {
            contextId,
            characterId,
            characterVersion: 1,
            statsVersion: 1,
            item: weapon,
            wallet: { walletId: 'w1', version: 1, gold: '1000000', points: '100' },
            attributes: [],
          },
        });
      }
      if (msg.query === 'service.quote') {
        const nextLvl = weapon.enhancementLevel + 1;
        const curAp = Number(weapon.enhancementBonus?.attackPower ?? '1000');
        const nextAp = String(curAp + 85);
        const risk = nextLvl <= 10 ? 'preserve' : nextLvl <= 12 ? 'downgrade' : 'destroy';
        return JSON.stringify({
          kind: 'service.quote',
          requestId: msg.requestId,
          versions: [{ kind: 'character', id: characterId, version: 1 }],
          data: {
            serviceKind: 'enhancement',
            quoteRef: 'sandbox-quote-enhance',
            characterId,
            contextId,
            targetVersions: [{ kind: 'character', id: characterId, version: 1 }],
            enhancement: {
              targetLevel: nextLvl,
              failureConsequences: [risk],
              costs: [{ currency: 'gold', amount: String(nextLvl * 5000) }],
              materialCosts: [{ templateId: 'mat-carbon', quantity: Math.min(20, nextLvl + 2) }],
              displayChanges: [{ kind: 'attackPower', before: String(curAp), after: nextAp }],
            },
            serverTime: Date.now(),
          },
        });
      }
      if (msg.command === 'equipment.enhance') {
        const targetLvl = weapon.enhancementLevel + 1;
        weapon.enhancementLevel = targetLvl;
        const curAp = Number(weapon.enhancementBonus?.attackPower ?? '1000');
        weapon.enhancementBonus = { configRef: 'v1', level: targetLvl, attackPower: String(curAp + 85) };
        return JSON.stringify({
          operationId: msg.operationId,
          outcome: {
            status: 'success',
            data: { itemId: weapon.itemId, targetLevel: targetLvl, result: 'success', deliveryRefs: [] },
            resultVersions: [{ kind: 'character', id: characterId, version: 2 }],
          },
        });
      }
      return JSON.stringify({ status: 'ok' });
    },
  };

  const coordinator = new EnhancementCoordinator(transport, persistence, () => `enhance-${Date.now().toString(36)}`);
  coordinator.init({ sessionId: 'sandbox-session', sessionEpoch: 1, characterId, rolePlayEpoch: 1 });
  return { coordinator, contextId, labels: PROTOTYPE_LABELS };
}

export function createSandboxRankingCoordinator(): { coordinator: RankingCoordinator; identity: RankingIdentity } {
  const identity: RankingIdentity = {
    sessionId: 'sandbox-session',
    sessionEpoch: 1,
    characterId: 'char-test-308',
  };

  const sampleAll: RankingItemView[] = [
    { characterId: 'c1', classId: 'warrior', characterName: '斩铁狂徒', level: 30, rank: 1, score: '3250', scoreConfigRef: 'v1', equipmentVersion: 1, scoreReachedAt: Date.now() - 3600000 },
    { characterId: 'c2', classId: 'hunter', characterName: '百步穿杨', level: 30, rank: 2, score: '3120', scoreConfigRef: 'v1', equipmentVersion: 2, scoreReachedAt: Date.now() - 7200000 },
    { characterId: 'char-test-308', classId: 'warrior', characterName: '狂暴战士(我)', level: 30, rank: 3, score: '3040', scoreConfigRef: 'v1', equipmentVersion: 5, scoreReachedAt: Date.now() - 1800000 },
    { characterId: 'c4', classId: 'warrior', characterName: '极速嗜血', level: 29, rank: 4, score: '2980', scoreConfigRef: 'v1', equipmentVersion: 3, scoreReachedAt: Date.now() - 86400000 },
    { characterId: 'c5', classId: 'hunter', characterName: '暗夜游侠', level: 28, rank: 5, score: '2860', scoreConfigRef: 'v1', equipmentVersion: 1, scoreReachedAt: Date.now() - 90000000 },
    { characterId: 'c6', classId: 'warrior', characterName: '狂风骤雨', level: 27, rank: 6, score: '2720', scoreConfigRef: 'v1', equipmentVersion: 1, scoreReachedAt: Date.now() - 95000000 },
    { characterId: 'c7', classId: 'hunter', characterName: '逐风鹰眼', level: 26, rank: 7, score: '2650', scoreConfigRef: 'v1', equipmentVersion: 1, scoreReachedAt: Date.now() - 98000000 },
    { characterId: 'c8', classId: 'warrior', characterName: '不灭之盾', level: 25, rank: 8, score: '2540', scoreConfigRef: 'v1', equipmentVersion: 1, scoreReachedAt: Date.now() - 100000000 },
  ];

  const handler = async (query: AssetQuery): Promise<AssetQueryResponse<'ranking.list'>> => {
    const scope = (query.payload as any)?.scope ?? 'all';
    let filtered = sampleAll;
    if (scope === 'warrior') filtered = sampleAll.filter(e => e.classId === 'warrior');
    else if (scope === 'hunter') filtered = sampleAll.filter(e => e.classId === 'hunter');

    const indexed = filtered.map((e, idx) => ({
      character: {
        characterId: e.characterId,
        classId: e.classId,
        characterName: e.characterName,
        level: e.level,
      },
      rank: idx + 1,
      score: {
        basis: 'intrinsicEquipmentValue' as const,
        value: e.score,
        scoreConfigRef: e.scoreConfigRef,
        equipmentVersion: e.equipmentVersion,
        scoreReachedAt: time(e.scoreReachedAt),
      },
    }));
    const ownIndex = indexed.findIndex(e => e.character.characterId === identity.characterId);
    const ownRank = ownIndex >= 0 ? ownIndex + 1 : null;

    return {
      requestId: query.requestId,
      serverTime: time(Date.now()),
      versions: [],
      data: {
        entries: indexed,
        ownRank,
        rankAsOf: time(Date.now() - 2500),
        stale: false,
        nextCursor: null,
      },
    };
  };

  const coordinator = new RankingCoordinator(handler);
  return { coordinator, identity };
}
