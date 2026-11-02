import type { DropCandidate } from './ground-drops.ts';
import { validateDropConfig } from './ground-drops.ts';
import type { BankHoldingsDomain } from '../bank/bank-service.ts';
import type { CharacterEntity } from '../character/character-model.ts';
import type { parseHoldingsView } from '../../../shared/src/protocol/asset-v2.ts';

export type DropStrategyId = 'weighted-random' | 'missing-slot-first' | 'weighted-missing-first';

export interface DropStrategyParameters {
  missingWeight?: number;
  normalWeight?: number;
}

export interface DropStrategyProfile {
  profileId: string;
  version: number;
  schemaVersion: 1;
  strategyId: DropStrategyId;
  parameters?: DropStrategyParameters;
  fallbackStrategy?: 'weighted-random';
  candidates: DropCandidate[];
  holdingsDomain?: BankHoldingsDomain;
}

export interface DropStrategyContext {
  character: CharacterEntity;
  summaries?: ReturnType<typeof parseHoldingsView>[];
  holdingsDomain?: BankHoldingsDomain;
  now: number;
  source: {
    kind: string;
    monsterLevel: number;
  };
}

function check(condition: unknown): asserts condition {
  if (!condition) throw new TypeError('CONFIG_NOT_READY');
}

export function validateDropStrategyProfile(profile: DropStrategyProfile): DropStrategyProfile {
  check(profile && typeof profile === 'object');
  check(typeof profile.profileId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(profile.profileId));
  check(Number.isSafeInteger(profile.version) && profile.version > 0);
  check(profile.schemaVersion === 1);
  check(['weighted-random', 'missing-slot-first', 'weighted-missing-first'].includes(profile.strategyId));

  if (profile.fallbackStrategy !== undefined) {
    check(profile.fallbackStrategy === 'weighted-random');
  }

  if (profile.parameters !== undefined) {
    check(typeof profile.parameters === 'object');
    if (profile.parameters.missingWeight !== undefined) {
      check(Number.isSafeInteger(profile.parameters.missingWeight) && profile.parameters.missingWeight > 0);
    }
    if (profile.parameters.normalWeight !== undefined) {
      check(Number.isSafeInteger(profile.parameters.normalWeight) && profile.parameters.normalWeight > 0);
    }
  }

  check(Array.isArray(profile.candidates) && profile.candidates.length > 0 && profile.candidates.length <= 32);
  validateDropConfig({
    profile: 'local-test-drops',
    authorization: 'isolated-local-assets-only',
    ref: profile.profileId,
    candidates: profile.candidates,
    holdingsDomain: profile.holdingsDomain,
  });

  if (profile.candidates.some(c => c.equipment?.setRef)) {
    const domain = profile.holdingsDomain;
    check(domain && domain.keys.length > 0 && domain.keys.length <= 64);
    check(new Set(domain.keys.map(k => k.collectionKey)).size === domain.keys.length);
    check(typeof domain.ref === 'string' && domain.ref.length > 0 && domain.ref.length <= 128);
    for (const k of domain.keys) {
      check(typeof k.collectionKey === 'string' && k.collectionKey.length > 0 && k.collectionKey.length <= 128);
      check(typeof k.setId === 'string' && k.setId.length > 0);
      check(Number.isSafeInteger(k.setVersion) && k.setVersion > 0);
      check([10, 15, 20, 25, 30].includes(k.itemLevel));
      check(['warrior', 'hunter'].includes(k.classId));
    }
  }

  return profile;
}

export function validateSpecialDungeonQualification(
  candidate: DropCandidate,
  source: { kind: string; monsterLevel: number },
  characterLevel: number,
): void {
  if (candidate.equipment?.setRef) {
    check(source.kind === 'special');
    check(source.monsterLevel === 30);
    check(characterLevel === 30);
    check(candidate.itemLevel === 30);
  }
}

export function validateHoldingsSummaryIntegrity(
  summary: any,
  expectedScope: 'character' | 'account',
  characterId: string,
  domain: BankHoldingsDomain,
): void {
  check(summary && typeof summary === 'object');
  check(summary.schemaVersion === 2);
  check(summary.scope === expectedScope);
  check(summary.domainRef === domain.ref);
  check(Number.isSafeInteger(summary.revision) && summary.revision >= 0);
  if (expectedScope === 'character') {
    check(summary.characterId === characterId);
  } else {
    check(summary.characterId === undefined);
  }
  check(Array.isArray(summary.entries) && summary.entries.length <= 64);
  const keys = new Set<string>();
  for (const entry of summary.entries) {
    check(entry && typeof entry === 'object');
    check(typeof entry.collectionKey === 'string' && domain.keys.some(k => k.collectionKey === entry.collectionKey));
    check(!keys.has(entry.collectionKey));
    keys.add(entry.collectionKey);
    check(Number.isSafeInteger(entry.permanentCount) && entry.permanentCount >= 0);
    if (entry.mailLatestExpiryAt !== null && entry.mailLatestExpiryAt !== undefined) {
      check(Number.isSafeInteger(entry.mailLatestExpiryAt) && entry.mailLatestExpiryAt >= 0);
    }
  }
}

export function isSlotHeld(
  collectionKey: string,
  summaries: any[],
  now: number,
): boolean {
  for (const s of summaries) {
    const entry = s.entries.find((e: any) => e.collectionKey === collectionKey);
    if (!entry) continue;
    if (entry.permanentCount > 0) return true;
    if (s.scope === 'character' && entry.mailLatestExpiryAt !== null && entry.mailLatestExpiryAt > now) {
      return true;
    }
  }
  return false;
}

export function isCandidateMissing(
  candidate: DropCandidate,
  context: DropStrategyContext,
): boolean {
  if (!candidate.equipment?.setRef) return false;
  const domain = context.holdingsDomain;
  if (!domain || !context.summaries) return false;

  const keys = domain.keys.filter(
    k =>
      k.setId === candidate.equipment!.setRef?.id &&
      k.setVersion === candidate.equipment!.setRef?.version &&
      k.slotId === candidate.equipment!.slotKind &&
      k.itemLevel === candidate.itemLevel &&
      k.classId === context.character.classId,
  );
  check(keys.length > 0);

  return keys.every(k => !isSlotHeld(k.collectionKey, context.summaries!, context.now));
}

export function getMissingCandidates(
  candidates: DropCandidate[],
  context: DropStrategyContext,
): DropCandidate[] {
  return candidates.filter(c => isCandidateMissing(c, context));
}

export function selectCandidateByStrategy(
  profile: DropStrategyProfile,
  sample: number,
  context: DropStrategyContext,
): DropCandidate {
  validateDropStrategyProfile(profile);

  const initial = profile.candidates[sample % profile.candidates.length];
  let pool = profile.candidates.filter(
    e =>
      e.equipment?.setRef?.id === initial.equipment?.setRef?.id &&
      e.equipment?.setRef?.version === initial.equipment?.setRef?.version &&
      e.itemLevel === initial.itemLevel &&
      e.quality === initial.quality,
  );

  if (initial.equipment?.setRef) {
    validateSpecialDungeonQualification(initial, context.source, context.character.level);
    check(context.holdingsDomain);
    check(context.summaries && context.summaries.length === 2);
    validateHoldingsSummaryIntegrity(context.summaries[0], 'character', context.character.id, context.holdingsDomain);
    validateHoldingsSummaryIntegrity(context.summaries[1], 'account', context.character.id, context.holdingsDomain);

    const missingCandidates = getMissingCandidates(pool, context);

    if (profile.strategyId === 'missing-slot-first') {
      if (missingCandidates.length > 0) {
        return missingCandidates[sample % missingCandidates.length];
      }
      // Full set collected: smooth fallback to weighted-random
      return pool[sample % pool.length];
    }

    if (profile.strategyId === 'weighted-missing-first') {
      if (missingCandidates.length === 0 || missingCandidates.length === pool.length) {
        return pool[sample % pool.length];
      }
      const missingWeight = profile.parameters?.missingWeight ?? 2;
      const normalWeight = profile.parameters?.normalWeight ?? 1;

      const weightedList: DropCandidate[] = [];
      for (const item of pool) {
        const isMissing = missingCandidates.includes(item);
        const count = isMissing ? missingWeight : normalWeight;
        for (let i = 0; i < count; i++) {
          weightedList.push(item);
        }
      }
      return weightedList[sample % weightedList.length];
    }

    // Default 'weighted-random'
    return pool[sample % pool.length];
  }

  return initial;
}
