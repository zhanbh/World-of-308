import {
  parseAssetCommand,
  parseAssetQuery,
  parseAssetResponse,
  parseAssetQueryResponse,
  parseEquipmentView,
  EQUIPMENT_SLOTS,
} from '../../../shared/src/protocol/asset-v2.ts';
import type {
  AssetCommand,
  AssetResponse,
  AssetQuery,
  AssetQueryResponse,
  EquipmentView,
} from '../../../shared/src/protocol/asset-v2.ts';
import { time, resource, encodeResource } from '../../../shared/src/exact-values.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import { identityKey, isVerifiedIdentity, loginKey } from '../identity/identity-v2.ts';
import type { LoginAccount, LoginSession, IdentityLink } from '../identity/login-model.ts';
import type { CharacterEntity, ContainerEntity, EquipmentEntity } from '../character/character-model.ts';
import { characterKey } from '../character/character-service.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable, canonical } from '../ports/store.ts';
import type {
  EquipmentCatalog,
  SetBonusConfig,
  EquipmentSlotName,
  RankingEntryEntity,
} from './equipment-model.ts';
import {
  Refusal,
  validateEquipEligibility,
  applyEquipBinding,
  calculateSingleItemScore,
  calculateTotalScore,
  aggregateCombatAttributes,
} from './equipment-rules.ts';

export type EquipmentCommand = Extract<AssetCommand, { command: 'equipment.equip' | 'equipment.unequip' }>;
export type EquipmentQuery = Extract<AssetQuery, { query: 'equipment.get' | 'character.get' }>;

interface Receipt {
  schemaVersion: 2;
  id: string;
  accountId: string;
  command: EquipmentCommand['command'];
  tuple: string;
  result: AssetResponse;
}

function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new Refusal(code);
}

function increment(value: number): number {
  requireValue(Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(value + 1), 'CONFIG_NOT_READY');
  return value + 1;
}

function budget(value: unknown, max: number): void {
  requireValue(new TextEncoder().encode(JSON.stringify(value)).length <= max, 'CONFIG_NOT_READY');
}

export function toEquipmentView(item: EquipmentEntity): EquipmentView {
  return parseEquipmentView({
    itemId: item.id,
    version: item.version,
    templateRef: item.templateRef.id,
    slotKind: item.slotKind,
    itemLevel: item.itemLevel,
    quality: item.quality,
    rolledAffixes: item.rolledAffixes.map(a => ({
      statId: a.stat,
      value: encodeResource(resource(String(a.value))),
    })),
    setRef: item.setRef ? item.setRef.id : undefined,
    enhancementLevel: item.enhancementLevel,
    binding:
      item.binding.kind === 'character'
        ? { kind: 'character', characterId: item.binding.characterId }
        : { kind: item.binding.kind },
    durability: item.durability.wearEnabled
      ? {
          wearEnabled: true,
          current: item.durability.current,
          max: item.durability.max,
          policyRef: item.durability.policyRef,
        }
      : {
          wearEnabled: false,
          current: null,
          max: null,
          policyRef: item.durability.policyRef,
        },
    location:
      item.location.kind === 'container'
        ? { kind: 'container', containerId: item.location.containerId }
        : item.location.kind === 'equipped'
        ? { kind: 'equipped', characterId: item.location.characterId, slotId: item.location.slotId }
        : { kind: 'pending', grantId: item.location.grantId },
    lifecycle: item.lifecycle,
    source: item.sourceLocator,
  });
}

export class EquipmentService {
  private readonly options: {
    store: Store;
    clock: Clock;
    identity: IdentityPort;
    catalog?: EquipmentCatalog;
    setConfigs?: Record<string, SetBonusConfig>;
  };

  constructor(options: {
    store: Store;
    clock: Clock;
    identity: IdentityPort;
    catalog?: EquipmentCatalog;
    setConfigs?: Record<string, SetBonusConfig>;
  }) {
    this.options = {
      ...options,
      catalog: options.catalog ? structuredClone(options.catalog) : undefined,
      setConfigs: options.setConfigs ? structuredClone(options.setConfigs) : undefined,
    };
  }

  private async caller(): Promise<{ id: string; tuple: string }> {
    const identity = await this.options.identity.verify();
    requireValue(isVerifiedIdentity(identity), 'AUTH_REQUIRED');
    return {
      id: await identityKey(identity),
      tuple: JSON.stringify([identity.provider, identity.appId, identity.subject, identity.environment]),
    };
  }

  private async authorize(
    tx: Transaction,
    caller: { id: string; tuple: string },
    sessionId: string,
    epoch: number,
  ): Promise<LoginAccount> {
    const link = await tx.get<IdentityLink>(caller.id);
    requireValue(link?.schemaVersion === 2 && link.id === caller.id && link.tuple === caller.tuple, 'AUTH_REQUIRED');
    const session = await tx.get<LoginSession>(sessionId);
    const account = await tx.get<LoginAccount>(link.accountId);
    requireValue(
      account &&
        account.schemaVersion === 2 &&
        account.id === link.accountId &&
        session?.schemaVersion === 2 &&
        session.id === sessionId &&
        session.accountId === account.id &&
        session.status === 'active' &&
        session.epoch === epoch &&
        account.currentSessionId === sessionId &&
        account.sessionEpoch === epoch,
      'SESSION_REVOKED',
    );
    return account;
  }

  private async getCharacter(tx: Transaction, account: LoginAccount, id: string): Promise<CharacterEntity> {
    const character = await tx.get<CharacterEntity>(id);
    requireValue(
      character?.schemaVersion === 2 &&
        character.id === id &&
        character.accountId === account.id &&
        Object.values(account.characterIdsByClass).includes(id),
      'NOT_FOUND_OR_FORBIDDEN',
    );
    requireValue(account.selectedCharacterId === id, 'NOT_FOUND_OR_FORBIDDEN');
    return character;
  }

  private async getBag(tx: Transaction, account: LoginAccount, character: CharacterEntity): Promise<ContainerEntity> {
    const bag = await tx.get<ContainerEntity>(character.backpackId);
    requireValue(
      bag?.schemaVersion === 2 &&
        bag.id === character.backpackId &&
        bag.kind === 'backpack' &&
        bag.accountId === account.id &&
        bag.characterId === character.id,
      'NOT_FOUND_OR_FORBIDDEN',
    );
    budget(bag, 65536);
    return bag;
  }

  async execute(value: unknown): Promise<AssetResponse> {
    const parsed = parseAssetCommand(value);
    if (parsed.command !== 'equipment.equip' && parsed.command !== 'equipment.unequip') {
      throw new TypeError('UNSUPPORTED_COMMAND');
    }
    const command: EquipmentCommand = parsed;
    const reply = (outcome: unknown, replayed = false) =>
      parseAssetResponse(command.command, {
        operationId: command.operationId,
        serverTime: time(this.options.clock.now()),
        replayed,
        outcome,
      });

    let caller: Awaited<ReturnType<EquipmentService['caller']>>;
    try {
      caller = await this.caller();
    } catch {
      return reply({ status: 'rejected', code: 'AUTH_REQUIRED' });
    }

    try {
      return await this.options.store.run(async tx => {
        const account = await this.authorize(tx, caller, command.sessionId, command.sessionEpoch);
        const opId = await loginKey('assetOp', [account.id, command.operationId]);
        const journalId = await loginKey('assetJournal', [account.id, command.operationId]);
        const tuple = canonical(command);

        const previous = await tx.get<Receipt>(opId);
        if (previous) {
          requireValue(previous.schemaVersion === 2 && previous.accountId === account.id && previous.id === opId, 'CONFIG_NOT_READY');
          if (previous.tuple !== tuple) return reply({ status: 'rejected', code: 'OPERATION_MISMATCH' });
          return parseAssetResponse(command.command, {
            ...previous.result,
            serverTime: time(this.options.clock.now()),
            replayed: true,
          });
        }

        const priorJournal = await tx.get(journalId);
        if (priorJournal !== undefined) return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });

        let outcome: unknown;
        let writes: Array<[string, unknown]> = [];

        try {
          const character = await this.getCharacter(tx, account, command.payload.characterId);
          const bag = await this.getBag(tx, account, character);

          // Verify version expectations
          const expectedObjects = [
            { kind: 'character', id: character.id, version: character.version },
            { kind: 'container', id: bag.id, version: bag.version },
          ];
          requireValue(
            command.expected.length >= expectedObjects.length &&
              expectedObjects.every(e => command.expected.some(v => v.kind === e.kind && v.id === e.id)),
            'INVALID_ARGUMENT',
          );
          requireValue(
            expectedObjects.every(e => command.expected.some(v => v.kind === e.kind && v.id === e.id && v.version === e.version)),
            'VERSION_CONFLICT',
          );

          const now = time(this.options.clock.now());
          const nowMs = this.options.clock.now();
          const equippedMap = { ...character.equipped };
          let targetItem: EquipmentEntity;
          let swappedOldItem: EquipmentEntity | null = null;

          if (command.command === 'equipment.equip') {
            const { itemId, targetSlot } = command.payload;

            // Find item in bag
            const slotPair = Object.entries(bag.slots).find(
              ([_, s]) => s.kind === 'equipment' && s.itemId === itemId,
            );
            requireValue(slotPair, 'ITEM_NOT_ELIGIBLE');
            const originalSlotIndex = Number(slotPair[0]);

            targetItem = (await tx.get<EquipmentEntity>(itemId))!;
            requireValue(
              targetItem?.schemaVersion === 2 &&
                targetItem.id === itemId &&
                targetItem.accountId === account.id &&
                targetItem.lifecycle === 'active',
              'ITEM_NOT_ELIGIBLE',
            );
            requireValue(
              targetItem.location.kind === 'container' && targetItem.location.containerId === bag.id,
              'ITEM_NOT_ELIGIBLE',
            );

            // Eligibility check
            validateEquipEligibility(character, targetItem, targetSlot, this.options.catalog);

            // Trinket CD lock: if targetSlot is trinket and currently equipped trinket is on cooldown
            const currentEquippedTrinketId = equippedMap.trinket;
            if (targetSlot === 'trinket' && currentEquippedTrinketId) {
              if (character.staminaReservation && character.staminaReservation.startsWith('trinket-cd:')) {
                const cdUntil = Number(character.staminaReservation.slice('trinket-cd:'.length));
                requireValue(Number.isNaN(cdUntil) || nowMs >= cdUntil, 'LOCATION_NOT_ALLOWED');
              }
            }

            // Purple auto-binding
            targetItem.binding = applyEquipBinding(targetItem, account.id, character.id);

            // Check if slot currently has an item
            const currentEquippedId = equippedMap[targetSlot as EquipmentSlotName];
            if (currentEquippedId) {
              swappedOldItem = (await tx.get<EquipmentEntity>(currentEquippedId))!;
              requireValue(
                swappedOldItem?.schemaVersion === 2 && swappedOldItem.lifecycle === 'active',
                'CONFIG_NOT_READY',
              );

              // In-place swap: old item takes vacated backpack slot
              swappedOldItem.location = { kind: 'container', containerId: bag.id };
              swappedOldItem.version = increment(swappedOldItem.version);
              swappedOldItem.updatedAt = now;
              bag.slots[originalSlotIndex] = {
                kind: 'equipment',
                itemId: swappedOldItem.id,
                sortHeader: {
                  itemLevel: swappedOldItem.itemLevel,
                  quality: swappedOldItem.quality,
                  slotKind: swappedOldItem.slotKind,
                },
              };
              writes.push([swappedOldItem.id, swappedOldItem]);
            } else {
              delete bag.slots[originalSlotIndex];
            }

            // Put target item into slot
            targetItem.location = { kind: 'equipped', characterId: character.id, slotId: targetSlot };
            targetItem.version = increment(targetItem.version);
            targetItem.updatedAt = now;
            equippedMap[targetSlot as EquipmentSlotName] = targetItem.id;
            writes.push([targetItem.id, targetItem]);
          } else {
            // equipment.unequip
            const { itemId, slot } = command.payload;
            requireValue(equippedMap[slot as EquipmentSlotName] === itemId, 'NOT_FOUND_OR_FORBIDDEN');

            targetItem = (await tx.get<EquipmentEntity>(itemId))!;
            requireValue(
              targetItem?.schemaVersion === 2 &&
                targetItem.id === itemId &&
                targetItem.accountId === account.id &&
                targetItem.lifecycle === 'active',
              'NOT_FOUND_OR_FORBIDDEN',
            );
            requireValue(
              targetItem.location.kind === 'equipped' &&
                targetItem.location.characterId === character.id &&
                targetItem.location.slotId === slot,
              'NOT_FOUND_OR_FORBIDDEN',
            );

            // Trinket CD lock: if unequipped slot is trinket and currently in cooldown
            if (slot === 'trinket') {
              if (character.staminaReservation && character.staminaReservation.startsWith('trinket-cd:')) {
                const cdUntil = Number(character.staminaReservation.slice('trinket-cd:'.length));
                requireValue(Number.isNaN(cdUntil) || nowMs >= cdUntil, 'LOCATION_NOT_ALLOWED');
              }
            }

            // Bag full check
            const occupiedCount = Object.keys(bag.slots).length;
            requireValue(occupiedCount < bag.capacity, 'BAG_FULL');

            // Find first free slot
            let freeIndex = -1;
            for (let i = 0; i < bag.capacity; i++) {
              if (!Object.hasOwn(bag.slots, i)) {
                freeIndex = i;
                break;
              }
            }
            requireValue(freeIndex >= 0, 'BAG_FULL');

            bag.slots[freeIndex] = {
              kind: 'equipment',
              itemId: targetItem.id,
              sortHeader: {
                itemLevel: targetItem.itemLevel,
                quality: targetItem.quality,
                slotKind: targetItem.slotKind,
              },
            };
            targetItem.location = { kind: 'container', containerId: bag.id };
            targetItem.version = increment(targetItem.version);
            targetItem.updatedAt = now;
            delete equippedMap[slot as EquipmentSlotName];
            writes.push([targetItem.id, targetItem]);
          }

          // Fetch all equipped items to calculate 13-slot score & attributes
          const currentEquippedEntities: Partial<Record<EquipmentSlotName, EquipmentEntity>> = {};
          for (const s of EQUIPMENT_SLOTS) {
            const eqId = equippedMap[s];
            if (!eqId) continue;
            if (eqId === targetItem.id) {
              currentEquippedEntities[s] = targetItem;
            } else if (swappedOldItem && eqId === swappedOldItem.id) {
              currentEquippedEntities[s] = swappedOldItem;
            } else {
              const eq = await tx.get<EquipmentEntity>(eqId);
              if (eq) currentEquippedEntities[s] = eq;
            }
          }

          // Calculate score & maintain ranking entry
          const newScore = calculateTotalScore(currentEquippedEntities, this.options.catalog);
          const oldScore = (character as unknown as { score?: number }).score ?? 0;
          const oldReachedAt = (character as unknown as { scoreReachedAt?: number }).scoreReachedAt ?? now;

          let scoreReachedAt = oldReachedAt;
          if (newScore !== oldScore) {
            scoreReachedAt = now;
          }

          const nextEquipmentVersion = increment((character as unknown as { equipmentVersion?: number }).equipmentVersion ?? 0);
          const rankingKey = await characterKey('rankingEntry', [character.id]);

          const rankingEntry: RankingEntryEntity = {
            schemaVersion: 2,
            id: rankingKey,
            characterId: character.id,
            accountId: account.id,
            classId: character.classId,
            characterName: character.characterName,
            level: character.level,
            score: String(newScore),
            scoreConfigRef: 'score-v1',
            equipmentVersion: nextEquipmentVersion,
            scoreReachedAt,
            projectionVersion: nextEquipmentVersion,
            updatedAt: now,
          };
          budget(rankingEntry, 16384);
          writes.push([rankingKey, rankingEntry]);

          // Update character
          const nextCharacter = {
            ...character,
            equipped: equippedMap,
            statsVersion: increment(character.statsVersion),
            equipmentVersion: nextEquipmentVersion,
            score: newScore,
            scoreReachedAt,
            scoreConfigRef: 'score-v1',
            version: increment(character.version),
            updatedAt: now,
          };
          budget(nextCharacter, 16384);
          writes.push([character.id, nextCharacter]);

          // Update bag
          const nextBag = {
            ...bag,
            version: increment(bag.version),
            updatedAt: now,
          };
          budget(nextBag, 65536);
          writes.push([bag.id, nextBag]);

          const changes = {
            command: command.command,
            itemId: targetItem.id,
            slot: command.command === 'equipment.equip' ? command.payload.targetSlot : command.payload.slot,
            score: newScore,
            scoreReachedAt,
            equipmentVersion: nextEquipmentVersion,
          };

          const journal = {
            schemaVersion: 2,
            id: journalId,
            accountId: account.id,
            characterId: character.id,
            operationId: command.operationId,
            command: command.command,
            changes,
            createdAt: now,
          };
          budget(journal, 131072);
          writes.push(
            [account.id, { ...account, writeRevision: increment(account.writeRevision), updatedAt: now }],
            [journalId, journal],
          );

          const resultSlot = command.command === 'equipment.equip' ? command.payload.targetSlot : command.payload.slot;
          const resultVersions = [
            { kind: 'character', id: character.id, version: nextCharacter.version },
            { kind: 'container', id: bag.id, version: nextBag.version },
            { kind: 'equipment', id: targetItem.id, version: targetItem.version },
          ];
          if (swappedOldItem) {
            resultVersions.push({ kind: 'equipment', id: swappedOldItem.id, version: swappedOldItem.version });
          }

          outcome = {
            status: 'committed',
            data: { itemId: targetItem.id, slot: resultSlot },
            resultVersions,
          };
        } catch (error) {
          if (
            error instanceof Refusal ||
            (error instanceof Error &&
              ['CONFIG_NOT_READY', 'ITEM_NOT_ELIGIBLE', 'BAG_FULL', 'BINDING_RESTRICTED', 'LOCATION_NOT_ALLOWED'].includes(
                error.message,
              ))
          ) {
            outcome = { status: 'rejected', code: (error as Error).message };
            writes = [];
          } else throw error;
        }

        const result = reply(outcome);
        const receipt: Receipt = {
          schemaVersion: 2,
          id: opId,
          accountId: account.id,
          command: command.command,
          tuple,
          result,
        };
        budget(receipt, 16384);
        writes.push([opId, receipt]);

        for (const [key, val] of writes) tx.set(key, val);
        return result;
      });
    } catch (error) {
      if (error instanceof StoreUnavailable || error instanceof CommitUnknown) {
        return reply({ status: 'unknown', code: 'RESULT_UNKNOWN' });
      }
      throw error;
    }
  }

  async query(value: unknown): Promise<AssetQueryResponse> {
    const parsed = parseAssetQuery(value);
    if (parsed.query !== 'equipment.get' && parsed.query !== 'character.get') {
      throw new TypeError('UNSUPPORTED_QUERY');
    }
    const query: EquipmentQuery = parsed;
    const now = time(this.options.clock.now());

    let caller: Awaited<ReturnType<EquipmentService['caller']>>;
    try {
      caller = await this.caller();
    } catch {
      return parseAssetQueryResponse(query.query, {
        requestId: query.requestId,
        serverTime: now,
        error: { code: 'AUTH_REQUIRED' },
      });
    }

    return await this.options.store.run(async tx => {
      let account: LoginAccount;
      try {
        account = await this.authorize(tx, caller, query.sessionId, query.sessionEpoch);
      } catch {
        return parseAssetQueryResponse(query.query, {
          requestId: query.requestId,
          serverTime: now,
          error: { code: 'SESSION_REVOKED' },
        });
      }

      if (query.query === 'equipment.get') {
        const item = await tx.get<EquipmentEntity>(query.payload.itemId);
        if (!item || item.schemaVersion !== 2 || item.accountId !== account.id || item.lifecycle !== 'active') {
          return parseAssetQueryResponse(query.query, {
            requestId: query.requestId,
            serverTime: now,
            error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
          });
        }
        return parseAssetQueryResponse(query.query, {
          requestId: query.requestId,
          serverTime: now,
          versions: [{ kind: 'equipment', id: item.id, version: item.version }],
          data: toEquipmentView(item),
        });
      }

      // character.get
      const character = await tx.get<CharacterEntity>(query.payload.characterId);
      if (
        !character ||
        character.schemaVersion !== 2 ||
        character.accountId !== account.id ||
        !Object.values(account.characterIdsByClass).includes(character.id)
      ) {
        return parseAssetQueryResponse(query.query, {
          requestId: query.requestId,
          serverTime: now,
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      // Read equipped items to aggregate attributes
      const equippedEntities: Partial<Record<EquipmentSlotName, EquipmentEntity>> = {};
      for (const [slotId, itemId] of Object.entries(character.equipped)) {
        if (!itemId) continue;
        const eq = await tx.get<EquipmentEntity>(itemId);
        if (eq) equippedEntities[slotId as EquipmentSlotName] = eq;
      }

      const attributes = aggregateCombatAttributes(equippedEntities, this.options.setConfigs);
      const equippedList = Object.entries(character.equipped)
        .filter(([_, id]) => typeof id === 'string')
        .map(([slotId, itemId]) => ({ slotId, itemId: itemId! }));

      const locationKind =
        character.location.kind === 'challenge'
          ? 'dungeon'
          : character.location.kind === 'inn'
          ? 'inn'
          : 'town';
      const anchorId =
        character.location.kind === 'inn'
          ? character.location.characterId
          : character.location.kind === 'town'
          ? character.location.anchorId
          : 'dungeon-1';

      return parseAssetQueryResponse(query.query, {
        requestId: query.requestId,
        serverTime: now,
        versions: [{ kind: 'character', id: character.id, version: character.version }],
        data: {
          character: {
            characterId: character.id,
            classId: character.classId,
            characterName: character.characterName,
            level: character.level,
          },
          version: character.version,
          equipped: equippedList,
          skills: [
            { skillId: 'crossSlash', level: 1, unlocked: true },
            { skillId: 'earthSplitter', level: 1, unlocked: true },
            { skillId: 'ironWill', level: 1, unlocked: true },
            { skillId: 'berserkThrust', level: 1, unlocked: true },
          ],
          attributes,
          location: { kind: locationKind, anchorId },
          stamina: character.stamina.value,
          staminaAsOf: time(character.stamina.refillWindow),
        },
      });
    });
  }
}
