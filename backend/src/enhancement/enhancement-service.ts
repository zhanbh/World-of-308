import { parseAssetCommand, parseAssetQuery, parseAssetResponse, parseAssetQueryResponse, parseHoldingsView } from '../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetQueryResponse } from '../../../shared/src/protocol/asset-v2.ts';
import type { Expected } from '../../../shared/src/protocol/session-v2.ts';
import { resource, time } from '../../../shared/src/exact-values.ts';
import { manifestDigest } from '../../../shared/src/room-manifest.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { canonical, CommitUnknown, StoreUnavailable } from '../ports/store.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import { identityKey, isVerifiedIdentity, loginKey } from '../identity/identity-v2.ts';
import type { IdentityLink, LoginAccount, LoginSession } from '../identity/login-model.ts';
import type { CharacterEntity, ContainerEntity, EquipmentEntity, MailEntity } from '../character/character-model.ts';
import type { ServiceContextEntity, TownMapManifest } from '../town/town-model.ts';
import { DEFAULT_TOWN_MAP } from '../town/town-model.ts';
import type { WalletEntity } from '../shop/shop-model.ts';
import type { SetBonusConfig, EquipmentCatalog, RankingEntryEntity } from '../equipment/equipment-model.ts';
import { aggregateCombatAttributes, calculateTotalScore, Refusal as EquipmentRefusal } from '../equipment/equipment-rules.ts';
import { toEquipmentView } from '../equipment/equipment-service.ts';
import { characterKey } from '../character/character-service.ts';

/** Every probability, price, and return quantity is supplied explicitly; only local-test may run. */
export interface EnhancementConfig {
  profile: 'local-test';
  authorization: 'isolated-local-assets-only';
  ref: string;
  contextTtlMs: number;
  probabilityScale: 1000000;
  probabilityCap: number;
  luckPerPoint: number;
  luckCap: number;
  memoryStep: number;
  memorySourceCap: number;
  memoryTotalCap: number;
  distanceWeights: number[];
  goldByItemLevel: Record<string, { weapon: string[]; earring: string[] }>;
  materialTemplateRef: string;
  materialsByTarget: number[];
  earringAttackPowerByTarget: string[];
  highGradeProbabilityByTarget: number[];
  mementoTemplateRef: string;
  mementoCostByTarget: number[];
  mementoBonusByTarget: number[];
  destructionMementoReturnByTarget: number[];
}

/** Must return the same secret uniform millionth for an original intent across process restarts. */
export interface EnhancementRandom { sample(originalIntent: string): Promise<number> }

export interface EnhancementHoldingsDomain {
  ref: string;
  keys: readonly { collectionKey: string; setId: string; setVersion: number; itemLevel: number; slotId: string; classId: 'warrior' | 'hunter' }[];
}

interface HoldingsEntity {
  schemaVersion: 2; id: string; accountId: string; scope: 'character'; characterId: string;
  revision: number; domainRef: string;
  entries: { collectionKey: string; permanentCount: number; mailLatestExpiryAt: number | null }[];
}

export class KeyedEnhancementRandom implements EnhancementRandom {
  private secret: Uint8Array;
  constructor(secret: Uint8Array) {
    if (secret.length < 32) throw new TypeError('RANDOM_SECRET_TOO_SHORT');
    this.secret = new Uint8Array(secret);
  }
  async sample(originalIntent: string) {
    const key = await crypto.subtle.importKey('raw', this.secret as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    // Rejection sampling avoids modulo bias; deterministic counter never consumes another user attempt.
    for (let i = 0; i < 128; i++) {
      const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(JSON.stringify([originalIntent, i]))));
      const n = new DataView(bytes.buffer).getUint32(0);
      if (n < 4294000000) return n % 1000000;
    }
    throw new Error('RANDOM_UNAVAILABLE');
  }
}

type Command = Extract<AssetCommand, { command: 'equipment.enhance' }>;
interface Memory { schemaVersion: 2; id: string; accountId: string; characterId: string; rolePlayEpoch: number; configRef: string; values: number[]; version: number }
interface Receipt { schemaVersion: 2; id: string; accountId: string; command: string; tuple: string; result: ReturnType<typeof parseAssetResponse> }
class Refusal extends Error {}
function check(value: unknown, code = 'CONFIG_NOT_READY'): asserts value { if (!value) throw new Refusal(code) }
function inc(value: number) { check(Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(value + 1)); return value + 1 }
function budget(value: unknown, max = 131072) { check(new TextEncoder().encode(JSON.stringify(value)).length <= max) }

const lowBaseProbability = [800000, 800000, 800000, 800000, 800000, 700000, 700000, 600000, 600000, 600000];
const STACK_LIMIT = 20;
const MEMENTO_MAIL_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * Mary enhancement service. It keeps the fixed-intent sample, memory, asset consumption,
 * retirement, projections, and overflow delivery inside one account-fenced transaction.
 */
export class EnhancementService {
  private options: {
    store: Store; clock: Clock; identity: IdentityPort; config?: EnhancementConfig; random: EnhancementRandom;
    manifest: TownMapManifest; setConfigs?: Record<string, SetBonusConfig>; catalog?: EquipmentCatalog;
    holdingsDomain?: EnhancementHoldingsDomain;
  };

  constructor(options: {
    store: Store; clock: Clock; identity: IdentityPort; config?: EnhancementConfig; random: EnhancementRandom;
    manifest?: TownMapManifest; setConfigs?: Record<string, SetBonusConfig>; catalog?: EquipmentCatalog;
    holdingsDomain?: EnhancementHoldingsDomain;
  }) {
    this.options = {
      ...options,
      config: options.config && structuredClone(options.config),
      manifest: structuredClone(options.manifest ?? DEFAULT_TOWN_MAP),
      catalog: options.catalog && structuredClone(options.catalog),
      setConfigs: options.setConfigs && structuredClone(options.setConfigs),
      holdingsDomain: options.holdingsDomain && structuredClone(options.holdingsDomain),
    };
  }

  private config() {
    const c = this.options.config;
    check(c && c.profile === 'local-test' && c.authorization === 'isolated-local-assets-only' && /^[A-Za-z0-9_-]{1,64}$/.test(c.ref));
    check(Number.isSafeInteger(c.contextTtlMs) && c.contextTtlMs > 0 && c.contextTtlMs <= 60000);
    check(c.probabilityScale === 1000000 && Number.isSafeInteger(c.probabilityCap) && c.probabilityCap >= 800000 && c.probabilityCap < 1000000);
    for (const n of [c.luckPerPoint, c.luckCap, c.memoryStep, c.memorySourceCap, c.memoryTotalCap]) check(Number.isSafeInteger(n) && n > 0 && n <= 1000000);
    check(c.memoryStep <= c.memorySourceCap && c.memoryTotalCap <= c.probabilityCap && c.distanceWeights.length === 20 && c.distanceWeights[0] === 1000000);
    c.distanceWeights.forEach((n, i) => check(Number.isSafeInteger(n) && n >= 0 && n <= 1000000 && (!i || n <= c.distanceWeights[i - 1])));
    check(c.materialTemplateRef.length > 0 && c.materialTemplateRef.length <= 128 && c.materialTemplateRef !== c.mementoTemplateRef);
    check(c.materialsByTarget.length === 20 && c.earringAttackPowerByTarget.length === 20);
    check(c.highGradeProbabilityByTarget.length === 10 && c.mementoCostByTarget.length === 20 && c.mementoBonusByTarget.length === 20 && c.destructionMementoReturnByTarget.length === 20);
    check(c.mementoTemplateRef.length > 0 && c.mementoTemplateRef.length <= 128);
    c.materialsByTarget.forEach(n => check(Number.isSafeInteger(n) && n >= 1 && n <= 20));
    c.mementoCostByTarget.forEach(n => check(Number.isSafeInteger(n) && n >= 1 && n <= 20));
    c.mementoBonusByTarget.forEach(n => check(Number.isSafeInteger(n) && n >= 0 && n <= 1000000));
    c.destructionMementoReturnByTarget.forEach(n => check(Number.isSafeInteger(n) && n >= 0 && n <= 8));
    c.highGradeProbabilityByTarget.forEach(n => check(Number.isSafeInteger(n) && n >= 0 && n <= c.probabilityCap));
    check(c.highGradeProbabilityByTarget[0] === 500000 && c.highGradeProbabilityByTarget[1] === 400000 && c.highGradeProbabilityByTarget[2] === 300000 && c.highGradeProbabilityByTarget[3] === 250000);
    let previous = 0n, previousDelta = 0n;
    for (const value of c.earringAttackPowerByTarget) {
      const n = resource(value), delta = n - previous;
      check(delta > previousDelta && n % 2n === 0n && n <= 1000000000n);
      previous = n; previousDelta = delta;
    }
    for (const prices of Object.values(c.goldByItemLevel)) {
      check(prices.weapon.length === 20 && prices.earring.length === 20);
      for (let i = 0; i < 20; i++) check(resource(prices.weapon[i]) > resource(prices.earring[i]) && resource(prices.earring[i]) > 0n);
      // Each high-grade upgrade doubles the preceding target's gold cost.
      for (let i = 10; i < 20; i++) check(resource(prices.weapon[i]) === resource(prices.weapon[i - 1]) * 2n && resource(prices.earring[i]) === resource(prices.earring[i - 1]) * 2n);
    }
    check(Object.keys(c.goldByItemLevel).every(level => ['10', '15', '20', '25', '30'].includes(level)));
    budget(c, 16384);
    return c;
  }

  private async caller() {
    try {
      const identity = await this.options.identity.verify();
      check(isVerifiedIdentity(identity), 'AUTH_REQUIRED');
      return { id: await identityKey(identity), tuple: JSON.stringify([identity.provider, identity.appId, identity.subject, identity.environment]) };
    } catch { throw new Refusal('AUTH_REQUIRED') }
  }

  private async authorize(tx: Transaction, caller: { id: string; tuple: string }, sessionId: string, epoch: number) {
    const link = await tx.get<IdentityLink>(caller.id);
    check(link?.schemaVersion === 2 && link.id === caller.id && link.tuple === caller.tuple, 'AUTH_REQUIRED');
    const account = await tx.get<LoginAccount>(link.accountId), session = await tx.get<LoginSession>(sessionId);
    check(account?.schemaVersion === 2 && account.id === link.accountId && session?.schemaVersion === 2 && session.id === sessionId && session.accountId === account.id && session.status === 'active' && session.epoch === epoch && account.currentSessionId === sessionId && account.sessionEpoch === epoch, 'SESSION_REVOKED');
    return account;
  }

  private async character(tx: Transaction, account: LoginAccount, id: string) {
    const character = await tx.get<CharacterEntity>(id);
    check(character?.schemaVersion === 2 && character.id === id && character.accountId === account.id && account.selectedCharacterId === id && Object.values(account.characterIdsByClass).includes(id), 'NOT_FOUND_OR_FORBIDDEN');
    return character;
  }

  private ap(config: EnhancementConfig, slotKind: EquipmentEntity['slotKind'], level: number) {
    if (!level) return '0';
    const earring = resource(config.earringAttackPowerByTarget[level - 1]);
    return String(slotKind === 'weapon' ? earring * 3n / 2n : earring);
  }

  private async holdingForDestruction(tx: Transaction, account: LoginAccount, character: CharacterEntity, item: EquipmentEntity, targetLevel: number) {
    if (targetLevel < 13 || !item.setRef) return undefined;
    const domain = this.options.holdingsDomain;
    check(domain && typeof domain.ref === 'string' && domain.ref.length > 0 && domain.keys.length > 0 && domain.keys.length <= 64 && new Set(domain.keys.map(key => key.collectionKey)).size === domain.keys.length);
    const exact = domain.keys.filter(key => key.setId === item.setRef!.id && key.setVersion === item.setRef!.version && key.itemLevel === item.itemLevel && key.slotId === item.slotKind);
    check(exact.length > 0);
    const key = exact.find(candidate => candidate.classId === character.classId);
    if (!key) return undefined;
    const id = await loginKey('holdings', [account.id, 'character', character.id]);
    const holding = await tx.get<HoldingsEntity>(id);
    check(holding?.schemaVersion === 2 && holding.id === id && holding.accountId === account.id && holding.scope === 'character' && holding.characterId === character.id && holding.domainRef === domain.ref && Number.isSafeInteger(holding.revision) && holding.revision >= 0);
    try { parseHoldingsView({ scope: 'character', characterId: character.id, revision: holding.revision, domainRef: holding.domainRef, entries: holding.entries }) }
    catch { throw new Refusal('CONFIG_NOT_READY') }
    check(holding.entries.every(entry => domain.keys.some(candidate => candidate.collectionKey === entry.collectionKey)));
    const entry = holding.entries.find(value => value.collectionKey === key.collectionKey);
    check(entry && entry.permanentCount >= 1 && Number.isSafeInteger(entry.permanentCount));
    return { key, value: holding };
  }

  private async plan(tx: Transaction, account: LoginAccount, character: CharacterEntity, payload: Command['payload'], now: number, readOnly = false) {
    const config = this.config(), context = await tx.get<ServiceContextEntity>(payload.contextId), town = character.townState, map = this.options.manifest;
    check(context?.schemaVersion === 2 && context.id === payload.contextId && context.accountId === account.id && context.characterId === character.id && context.status === 'open' && context.serviceKind === 'enhance' && character.currentServiceContextId === context.id && context.rolePlayEpoch === character.rolePlayEpoch && town && context.sceneEpoch === town.sceneEpoch && context.locationRevision === town.locationRevision, 'CONTEXT_INVALID');
    check(character.location.kind === 'town' && character.location.mapId === map.mapId && town.mapRef === map.mapId && !account.activeChallengeId && !account.openSceneChallengeId, 'LOCATION_NOT_ALLOWED');
    const anchor = map.serviceAnchors[context.anchorId];
    check(anchor?.serviceKind === 'enhance' && Number.isFinite(town.position.x) && Number.isFinite(town.position.y) && (town.position.x - anchor.x) ** 2 + (town.position.y - anchor.y) ** 2 <= 576, 'LOCATION_NOT_ALLOWED');
    check(now >= context.issuedAt && now < context.issuedAt + config.contextTtlMs, 'CONTEXT_INVALID');
    const item = await tx.get<EquipmentEntity>(payload.itemId), bag = await tx.get<ContainerEntity>(character.backpackId), wallet = await tx.get<WalletEntity>(account.walletId);
    check(item?.schemaVersion === 2 && item.id === payload.itemId && item.accountId === account.id && item.lifecycle === 'active' && (!item.holderCharacterId || item.holderCharacterId === character.id) && ['weapon', 'earring'].includes(item.slotKind), 'ITEM_NOT_ELIGIBLE');
    check((item.binding.kind !== 'character' || item.binding.characterId === character.id) && (item.binding.kind === 'none' || item.binding.accountId === account.id), 'ITEM_NOT_ELIGIBLE');
    toEquipmentView(item);
    check(bag?.schemaVersion === 2 && bag.id === character.backpackId && bag.accountId === account.id && bag.characterId === character.id && bag.kind === 'backpack');
    check(Number.isSafeInteger(bag.capacity) && bag.capacity >= 20 && bag.capacity <= 100 && Object.keys(bag.slots).length <= bag.capacity && Object.keys(bag.slots).every(index => Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < bag.capacity));
    budget(bag, 65536);
    const bagEntries = Object.entries(bag.slots), equipped = item.location.kind === 'equipped';
    if (item.location.kind === 'equipped') check(item.location.characterId === character.id && item.location.slotId === item.slotKind && character.equipped[item.slotKind] === item.id && !bagEntries.some(([, slot]) => slot.kind === 'equipment' && slot.itemId === item.id), 'ITEM_NOT_ELIGIBLE');
    else check(item.location.kind === 'container' && item.location.containerId === bag.id && bagEntries.filter(([, slot]) => slot.kind === 'equipment' && slot.itemId === item.id).length === 1 && !Object.values(character.equipped).includes(item.id), 'ITEM_NOT_ELIGIBLE');
    check((readOnly || (item.enhancementLevel <= 19 && payload.targetLevel === item.enhancementLevel + 1)) && payload.targetLevel <= 20 && item.enhancementLevel <= 20 && !(payload.targetLevel <= 10 && payload.useMemento), 'ITEM_NOT_ELIGIBLE');
    if (payload.targetLevel >= 11) check(payload.targetLevel > 10 && item.enhancementLevel >= 10, 'ITEM_NOT_ELIGIBLE');
    if (item.enhancementLevel > 0) check(item.enhancementBonus?.configRef === config.ref && item.enhancementBonus.level === item.enhancementLevel && item.enhancementBonus.attackPower === this.ap(config, item.slotKind, item.enhancementLevel));
    else check(!item.enhancementBonus);
    check(wallet?.schemaVersion === 2 && wallet.id === account.walletId && wallet.accountId === account.id);
    resource(wallet.gold); resource(wallet.points);
    const gold = config.goldByItemLevel[String(item.itemLevel)]?.[item.slotKind as 'weapon' | 'earring']?.[payload.targetLevel - 1];
    check(gold !== undefined); resource(gold);
    const memoryId = await loginKey('enhancementMemory', [character.id, character.rolePlayEpoch]);
    const priorMemory = await tx.get<Memory>(memoryId);
    const memory = priorMemory ?? { schemaVersion: 2 as const, id: memoryId, accountId: account.id, characterId: character.id, rolePlayEpoch: character.rolePlayEpoch, configRef: config.ref, values: Array(20).fill(0), version: 0 };
    check(memory.schemaVersion === 2 && memory.id === memoryId && memory.accountId === account.id && memory.characterId === character.id && memory.rolePlayEpoch === character.rolePlayEpoch && memory.configRef === config.ref && memory.values.length === 20 && Number.isSafeInteger(memory.version) && memory.version >= 0 && memory.values.every(value => Number.isSafeInteger(value) && value >= 0 && value <= config.memorySourceCap));
    const mementoCost = payload.useMemento ? config.mementoCostByTarget[payload.targetLevel - 1] : 0;
    if (payload.useMemento) {
      check(payload.targetLevel >= 11, 'ITEM_NOT_ELIGIBLE');
      const count = bagEntries.reduce((sum, [, slot]) => sum + (slot.kind === 'stack' && slot.templateRef.id === config.mementoTemplateRef && slot.binding.kind === 'character' && slot.binding.accountId === account.id && slot.binding.characterId === character.id ? slot.quantity : 0), 0);
      check(count >= mementoCost, 'MATERIAL_NOT_ENOUGH');
    }
    const versions: Expected[] = [
      { kind: 'character', id: character.id, version: character.version },
      { kind: 'equipment', id: item.id, version: item.version },
      { kind: 'wallet', id: wallet.id, version: wallet.version },
      { kind: 'container', id: bag.id, version: bag.version },
    ];
    const holding = await this.holdingForDestruction(tx, account, character, item, payload.targetLevel);
    const material = config.materialsByTarget[payload.targetLevel - 1];
    const materialCosts = [{ templateRef: config.materialTemplateRef, quantity: material }, ...(payload.useMemento ? [{ templateRef: config.mementoTemplateRef, quantity: mementoCost }] : [])];
    const failureConsequences: Array<'preserve' | 'downgrade' | 'destroy' | 'consumeMemento'> = payload.targetLevel <= 10 ? ['preserve'] : payload.targetLevel <= 12 ? ['downgrade'] : ['destroy'];
    if (payload.useMemento) failureConsequences.push('consumeMemento');
    const quoteBase = {
      serviceKind: 'enhance' as const,
      configRef: config.ref,
      costs: [{ currency: 'gold' as const, amount: gold }],
      materialCosts,
      targetVersions: versions,
      displayChanges: [
        { kind: 'enhancementLevel' as const, before: String(item.enhancementLevel), after: String(payload.targetLevel) },
        { kind: 'attackPower' as const, before: this.ap(config, item.slotKind, item.enhancementLevel), after: this.ap(config, item.slotKind, payload.targetLevel) },
      ],
      failureConsequences,
    };
    const worn: Record<string, EquipmentEntity> = {};
    for (const [slot, id] of Object.entries(character.equipped)) {
      const equippedItem = id === item.id ? item : await tx.get<EquipmentEntity>(id!);
      check(equippedItem?.accountId === account.id && equippedItem.lifecycle === 'active' && equippedItem.location.kind === 'equipped' && equippedItem.location.characterId === character.id && equippedItem.location.slotId === slot);
      toEquipmentView(equippedItem); worn[slot] = equippedItem;
    }
    const luck = aggregateCombatAttributes(worn, this.options.setConfigs).find(value => value.statId === 'luck')?.value ?? '0';
    const rawLuckBonus = resource(luck) * BigInt(config.luckPerPoint);
    const luckBonus = Number(rawLuckBonus > BigInt(config.luckCap) ? BigInt(config.luckCap) : rawLuckBonus);
    const quoteRef = await manifestDigest({ accountId: account.id, sessionId: account.currentSessionId, sessionEpoch: account.sessionEpoch, characterId: character.id, rolePlayEpoch: character.rolePlayEpoch, context, versions, config, memory, holding, quoteBase, luckBonus, item: toEquipmentView(item) });
    return { item, bag, wallet, memory, config, equipped, luckBonus, material, mementoCost, gold, versions, holding, worn, quote: { ...quoteBase, quoteRef } };
  }

  async query(value: unknown): Promise<AssetQueryResponse> {
    const query = parseAssetQuery(value);
    if (query.query !== 'service.quote' && query.query !== 'operation.get' && query.query !== 'enhancement.get') throw new TypeError('UNSUPPORTED_QUERY');
    const reply = (body: unknown) => parseAssetQueryResponse(query.query, { requestId: query.requestId, serverTime: time(this.options.clock.now()), ...body as object });
    try {
      const caller = await this.caller();
      return await this.options.store.run(async tx => {
        const account = await this.authorize(tx, caller, query.sessionId, query.sessionEpoch);
        if (query.query === 'operation.get') {
          const id = await loginKey('assetOp', [account.id, query.payload.operationId]), receipt = await tx.get<Receipt>(id);
          if (!receipt) return reply({ versions: [], data: { status: 'notFound' } });
          check(receipt.schemaVersion === 2 && receipt.id === id && receipt.accountId === account.id, 'SERVICE_UNAVAILABLE');
          return reply({ versions: [], data: { status: 'found', command: receipt.command, result: receipt.result } });
        }
        const character = await this.character(tx, account, query.payload.characterId);
        if (query.query === 'service.quote') {
          check(query.payload.serviceIntent.command === 'equipment.enhance', 'INVALID_ARGUMENT');
          const plan = await this.plan(tx, account, character, query.payload.serviceIntent.payload as Command['payload'], this.options.clock.now());
          return reply({ versions: plan.versions, data: plan.quote });
        }
        const item = await tx.get<EquipmentEntity>(query.payload.itemId);
        check(item, 'ITEM_NOT_ELIGIBLE');
        const targetLevel = Math.min(item.enhancementLevel + 1, 20);
        const plan = await this.plan(tx, account, character, { characterId: character.id, contextId: query.payload.contextId, itemId: item.id, targetLevel, useMemento: false, quoteRef: 'unquoted' }, this.options.clock.now(), true);
        const worn: Record<string, EquipmentEntity> = {};
        for (const [slot, id] of Object.entries(character.equipped)) {
          const equippedItem = id === plan.item.id ? plan.item : await tx.get<EquipmentEntity>(id!);
          check(equippedItem?.accountId === account.id && equippedItem.lifecycle === 'active' && equippedItem.location.kind === 'equipped' && equippedItem.location.characterId === character.id && equippedItem.location.slotId === slot);
          toEquipmentView(equippedItem); worn[slot] = equippedItem;
        }
        return reply({ versions: plan.versions, data: { contextId: query.payload.contextId, characterId: character.id, characterVersion: character.version, statsVersion: character.statsVersion, item: toEquipmentView(plan.item), wallet: { walletId: plan.wallet.id, version: plan.wallet.version, gold: plan.wallet.gold, points: plan.wallet.points }, attributes: aggregateCombatAttributes(worn, this.options.setConfigs) } });
      });
    } catch (error) {
      if (error instanceof Refusal) return reply({ error: { code: error.message } });
      if (error instanceof CommitUnknown || error instanceof StoreUnavailable) return reply({ error: { code: 'SERVICE_UNAVAILABLE' } });
      if (error instanceof TypeError || error instanceof RangeError || error instanceof EquipmentRefusal) return reply({ error: { code: 'CONFIG_NOT_READY' } });
      throw error;
    }
  }

  private consumeStack(bag: ContainerEntity, templateRef: string, quantity: number, accountId: string, characterId: string, journalId: string, characterBoundOnly = false) {
    let remaining = quantity;
    const flows: Array<{ slotIndex: number; stackId: string; traceRef: string; quantity: number }> = [];
    const candidates = Object.entries(bag.slots).filter(([, slot]) => slot.kind === 'stack' && slot.templateRef.id === templateRef)
      .sort(([left], [right]) => Number(left) - Number(right));
    for (const [indexText, slot] of candidates) {
      if (remaining === 0) break;
      if (slot.kind !== 'stack') continue;
      check(Number.isSafeInteger(slot.quantity) && slot.quantity >= 1 && slot.quantity <= STACK_LIMIT && slot.traceRef.length > 0);
      const legal = characterBoundOnly
        ? slot.binding.kind === 'character' && slot.binding.accountId === accountId && slot.binding.characterId === characterId
        : (slot.binding.kind !== 'character' || slot.binding.characterId === characterId) && (slot.binding.kind === 'none' || slot.binding.accountId === accountId);
      if (!legal) continue;
      const used = Math.min(slot.quantity, remaining), index = Number(indexText);
      flows.push({ slotIndex: index, stackId: slot.stackId, traceRef: slot.traceRef, quantity: used });
      remaining -= used; slot.quantity -= used;
      if (slot.quantity === 0) delete bag.slots[index];
      else slot.traceRef = `${journalId}:output:consume:${index}`;
    }
    check(remaining === 0, 'MATERIAL_NOT_ENOUGH');
    return flows;
  }

  private async returnMementos(bag: ContainerEntity, quantity: number, config: EnhancementConfig, accountId: string, characterId: string, operationId: string, journalId: string) {
    let remaining = quantity;
    const binding = { kind: 'character' as const, accountId, characterId };
    const flows: Array<{ slotIndex: number; quantity: number; stackId: string }> = [];
    const matching = Object.entries(bag.slots).filter(([, slot]) => slot.kind === 'stack' && slot.templateRef.id === config.mementoTemplateRef && slot.binding.kind === 'character' && slot.binding.accountId === accountId && slot.binding.characterId === characterId)
      .sort(([left], [right]) => Number(left) - Number(right));
    for (const [indexText, slot] of matching) {
      if (remaining === 0) break;
      if (slot.kind !== 'stack') continue;
      check(Number.isSafeInteger(slot.quantity) && slot.quantity >= 1 && slot.quantity <= STACK_LIMIT);
      const added = Math.min(remaining, STACK_LIMIT - slot.quantity);
      if (added > 0) {
        slot.quantity += added; slot.traceRef = `${journalId}:output:return:${indexText}`;
        flows.push({ slotIndex: Number(indexText), quantity: added, stackId: slot.stackId }); remaining -= added;
      }
    }
    for (let index = 0; index < bag.capacity && remaining > 0; index++) {
      if (bag.slots[index] !== undefined) continue;
      const added = Math.min(remaining, STACK_LIMIT);
      const stackId = await loginKey('enhanceStack', [accountId, operationId, index]);
      bag.slots[index] = { kind: 'stack', stackId, templateRef: { id: config.mementoTemplateRef, version: 1 }, quantity: added, binding, traceRef: `${journalId}:output:return:${index}` };
      flows.push({ slotIndex: index, quantity: added, stackId }); remaining -= added;
    }
    return { flows, mailedQuantity: remaining };
  }

  async execute(value: unknown) {
    const command = parseAssetCommand(value);
    if (command.command !== 'equipment.enhance') throw new TypeError('UNSUPPORTED_COMMAND');
    const reply = (outcome: unknown) => parseAssetResponse('equipment.enhance', { operationId: command.operationId, serverTime: time(this.options.clock.now()), replayed: false, outcome });
    let fixedSample: Promise<number> | undefined;
    try {
      const caller = await this.caller();
      return await this.options.store.run(async tx => {
        const account = await this.authorize(tx, caller, command.sessionId, command.sessionEpoch), now = this.options.clock.now();
        const operationId = await loginKey('assetOp', [account.id, command.operationId]), journalId = await loginKey('assetJournal', [account.id, command.operationId]), tuple = canonical(command);
        const old = await tx.get<Receipt>(operationId);
        if (old) {
          check(old.schemaVersion === 2 && old.id === operationId && old.accountId === account.id, 'SERVICE_UNAVAILABLE');
          check(old.command === command.command && old.tuple === tuple, 'OPERATION_MISMATCH');
          return parseAssetResponse('equipment.enhance', { ...old.result, serverTime: now, replayed: true });
        }
        check(await tx.get(journalId) === undefined, 'SERVICE_UNAVAILABLE');
        const character = await this.character(tx, account, command.payload.characterId);
        let outcome: unknown, changes: unknown = null;
        try {
          const plan = await this.plan(tx, account, character, command.payload, now);
          check(command.expected.length === plan.versions.length && plan.versions.every(expected => command.expected.some(value => value.kind === expected.kind && value.id === expected.id)), 'INVALID_ARGUMENT');
          check(plan.versions.every(expected => command.expected.some(value => value.kind === expected.kind && value.id === expected.id && value.version === expected.version)), 'VERSION_CONFLICT');
          check(command.payload.quoteRef === plan.quote.quoteRef, 'QUOTE_CHANGED');
          check(resource(plan.wallet.gold) >= resource(plan.gold), 'CURRENCY_NOT_ENOUGH');

          const nextBag = structuredClone(plan.bag);
          const materialFlows = this.consumeStack(nextBag, plan.config.materialTemplateRef, plan.material, account.id, character.id, journalId);
          const mementoFlows = plan.mementoCost ? this.consumeStack(nextBag, plan.config.mementoTemplateRef, plan.mementoCost, account.id, character.id, journalId, true) : [];
          fixedSample ??= this.options.random.sample(JSON.stringify([account.id, command.operationId]));
          const sample = await fixedSample;
          check(Number.isSafeInteger(sample) && sample >= 0 && sample < plan.config.probabilityScale);
          let memoryBonus = 0;
          for (let i = 0; i < 20; i++) memoryBonus += Math.floor(plan.memory.values[i] * plan.config.distanceWeights[Math.abs(i + 1 - command.payload.targetLevel)] / 1000000);
          const baseProbability = command.payload.targetLevel <= 10 ? lowBaseProbability[command.payload.targetLevel - 1] : plan.config.highGradeProbabilityByTarget[command.payload.targetLevel - 11];
          const mementoBonus = plan.mementoCost ? plan.config.mementoBonusByTarget[command.payload.targetLevel - 1] : 0;
          const threshold = Math.min(plan.config.probabilityCap, baseProbability + plan.luckBonus + mementoBonus + Math.min(plan.config.memoryTotalCap, memoryBonus));
          const success = sample < threshold;
          const destroyed = !success && command.payload.targetLevel >= 13;
          const downgraded = !success && command.payload.targetLevel >= 11 && command.payload.targetLevel <= 12;
          const itemChanged = success || destroyed || downgraded;
          let nextItem = plan.item;
          if (itemChanged) {
            if (success) nextItem = { ...plan.item, enhancementLevel: command.payload.targetLevel, enhancementBonus: { configRef: plan.config.ref, level: command.payload.targetLevel, attackPower: this.ap(plan.config, plan.item.slotKind, command.payload.targetLevel) }, version: inc(plan.item.version), updatedAt: now };
            else if (downgraded) nextItem = { ...plan.item, enhancementLevel: 10, enhancementBonus: { configRef: plan.config.ref, level: 10, attackPower: this.ap(plan.config, plan.item.slotKind, 10) }, version: inc(plan.item.version), updatedAt: now };
            else nextItem = { ...plan.item, location: { kind: 'retired', reason: 'destroyed', sourceRef: plan.item.id }, lifecycle: 'destroyed', version: inc(plan.item.version), updatedAt: now };
          }

          const values = plan.memory.values.map((old, index) => success ? Math.floor(old * (1000000 - plan.config.distanceWeights[Math.abs(index + 1 - command.payload.targetLevel)]) / 1000000) : old);
          if (!success) values[command.payload.targetLevel - 1] = Math.min(plan.config.memorySourceCap, values[command.payload.targetLevel - 1] + plan.config.memoryStep);
          const nextMemory = { ...plan.memory, values, version: inc(plan.memory.version) };
          let holdingWrite: HoldingsEntity | undefined;
          if (destroyed && plan.holding) {
            const entries = structuredClone(plan.holding.value.entries), entry = entries.find(value => value.collectionKey === plan.holding!.key.collectionKey);
            check(entry && entry.permanentCount >= 1, 'CONFIG_NOT_READY');
            entry.permanentCount -= 1;
            holdingWrite = { ...plan.holding.value, entries, revision: inc(plan.holding.value.revision) };
          }

          if (destroyed && !plan.equipped) {
            const slot = Object.entries(nextBag.slots).find(([, value]) => value.kind === 'equipment' && value.itemId === plan.item.id);
            check(slot, 'CONFIG_NOT_READY');
            delete nextBag.slots[Number(slot[0])];
          }

          const returnQuantity = destroyed ? plan.config.destructionMementoReturnByTarget[command.payload.targetLevel - 1] : 0;
          const returned = returnQuantity ? await this.returnMementos(nextBag, returnQuantity, plan.config, account.id, character.id, command.operationId, journalId) : { flows: [], mailedQuantity: 0 };
          let mementoMail: MailEntity | undefined;
          if (returned.mailedQuantity > 0) {
            const mailId = await characterKey('mail', [account.id, character.id, 'enhancement-memento', command.operationId]);
            check(await tx.get(mailId) === undefined, 'SERVICE_UNAVAILABLE');
            mementoMail = {
              schemaVersion: 2, id: mailId, accountId: account.id, characterId: character.id,
              sourceKey: `enhance-memento:${command.operationId}`, titleKey: 'mail.enhancement-memento.title', bodyKey: 'mail.enhancement-memento.body',
              parameters: { targetLevel: command.payload.targetLevel, quantity: returned.mailedQuantity },
              expiresAt: time(now + MEMENTO_MAIL_TTL), status: 'active', readAt: null, version: 0,
              attachments: [{ attachmentId: 'memento-return', kind: 'stack', templateRef: { id: plan.config.mementoTemplateRef, version: 1 }, quantityGranted: returned.mailedQuantity, quantityClaimed: 0, binding: { kind: 'character', accountId: account.id, characterId: character.id }, state: 'available' }],
              createdAt: time(now), updatedAt: time(now),
            };
            budget(mementoMail, 8192);
          }

          const worn: Record<string, EquipmentEntity> = { ...plan.worn };
          if (plan.equipped && itemChanged) {
            if (destroyed) delete worn[plan.item.slotKind];
            else worn[plan.item.slotKind] = nextItem;
          }
          let nextCharacter: CharacterEntity = { ...character, version: inc(character.version), updatedAt: now };
          const writes: Array<[string, unknown]> = [];
          if (itemChanged) writes.push([nextItem.id, nextItem]);
          if (plan.equipped && itemChanged) {
            const equipped = { ...character.equipped };
            if (destroyed) delete equipped[plan.item.slotKind]; else equipped[plan.item.slotKind] = plan.item.id;
            const after = aggregateCombatAttributes(worn, this.options.setConfigs), before = aggregateCombatAttributes(plan.worn, this.options.setConfigs);
            const score = calculateTotalScore(worn, this.options.catalog), scoreChanged = score !== (character.score ?? 0), equipmentVersion = inc(character.equipmentVersion);
            nextCharacter = { ...nextCharacter, equipped, statsVersion: canonical(before) !== canonical(after) ? inc(character.statsVersion) : character.statsVersion, equipmentVersion, score, scoreConfigRef: 'score-v1', scoreReachedAt: scoreChanged ? now : (character.scoreReachedAt ?? now) };
            const rankingId = await characterKey('rankingEntry', [character.id]);
            await tx.get(rankingId);
            const ranking: RankingEntryEntity = { schemaVersion: 2, id: rankingId, characterId: character.id, accountId: account.id, classId: character.classId, characterName: character.characterName, level: character.level, score: String(score), scoreConfigRef: 'score-v1', equipmentVersion, scoreReachedAt: nextCharacter.scoreReachedAt!, projectionVersion: equipmentVersion, updatedAt: now };
            writes.push([rankingId, ranking]);
          }
          if (mementoMail) nextCharacter = { ...nextCharacter, mailIds: [...new Set([...(nextCharacter.mailIds ?? []), mementoMail.id])] };
          const nextWallet: WalletEntity = { ...plan.wallet, gold: String(resource(plan.wallet.gold) - resource(plan.gold)), version: inc(plan.wallet.version), updatedAt: now };
          nextBag.version = inc(nextBag.version); nextBag.updatedAt = now;
          writes.push([nextMemory.id, nextMemory], [nextBag.id, nextBag], [nextWallet.id, nextWallet], [character.id, nextCharacter], [account.id, { ...account, writeRevision: inc(account.writeRevision) }]);
          if (holdingWrite) writes.push([holdingWrite.id, holdingWrite]);
          if (mementoMail) writes.push([mementoMail.id, mementoMail]);
          for (const [, entity] of writes) budget(entity);
          const resultName = success ? 'success' : destroyed ? 'destroyed' : 'failed';
          const deliveryRefs = mementoMail ? [mementoMail.id] : [];
          changes = {
            outputs: Object.entries(nextBag.slots).filter(([, entry]) => entry.kind === 'stack' && entry.traceRef.includes(journalId)).map(([index, entry]) => ({ index, ...entry })),
            configRef: plan.config.ref, configHash: await manifestDigest(plan.config), sample, threshold,
            memoryBefore: plan.memory, memoryAfter: nextMemory, materialFlows, mementoFlows, mementoReturns: returned.flows,
            mementoMail: mementoMail ? { mailId: mementoMail.id, quantity: returned.mailedQuantity, expiresAt: mementoMail.expiresAt } : null,
            wallet: { before: plan.wallet.gold, after: nextWallet.gold },
            item: { before: toEquipmentView(plan.item), after: toEquipmentView(nextItem) },
            holding: holdingWrite ? { collectionKey: plan.holding!.key.collectionKey, before: plan.holding!.value.revision, after: holdingWrite.revision } : null,
          };
          const itemVersion = itemChanged ? nextItem.version : plan.item.version;
          const data = { itemId: plan.item.id, targetLevel: command.payload.targetLevel, result: resultName, deliveryRefs };
          outcome = { status: 'committed', data, resultVersions: [
            { kind: 'character', id: character.id, version: nextCharacter.version },
            { kind: 'equipment', id: plan.item.id, version: itemVersion },
            { kind: 'wallet', id: plan.wallet.id, version: nextWallet.version },
            { kind: 'container', id: nextBag.id, version: nextBag.version },
          ] };
          for (const [id, entity] of writes) tx.set(id, entity);
        } catch (error) {
          if (error instanceof Refusal) outcome = { status: 'rejected', code: error.message };
          else throw error;
        }
        const response = reply(outcome), receipt: Receipt = { schemaVersion: 2, id: operationId, accountId: account.id, command: command.command, tuple, result: response };
        const journal = { schemaVersion: 2, id: journalId, accountId: account.id, operationId: command.operationId, command: command.command, quoteRef: command.payload.quoteRef, source: { kind: 'enhancement', contextId: command.payload.contextId }, expected: command.expected, changes, outcome: response.outcome, createdAt: now };
        budget(receipt, 16384); budget(journal);
        tx.set(journalId, journal); tx.set(operationId, receipt);
        return response;
      });
    } catch (error) {
      if (error instanceof Refusal) return reply({ status: 'rejected', code: error.message });
      if (error instanceof CommitUnknown) return reply({ status: 'unknown', code: 'RESULT_UNKNOWN' });
      if (error instanceof StoreUnavailable) return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
      if (error instanceof TypeError || error instanceof RangeError || error instanceof EquipmentRefusal) return reply({ status: 'rejected', code: 'CONFIG_NOT_READY' });
      throw error;
    }
  }
}
