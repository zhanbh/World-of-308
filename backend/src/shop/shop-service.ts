import { time } from '../../../shared/src/exact-values.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable } from '../ports/store.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import { identityKey, isVerifiedIdentity, loginKey } from '../identity/identity-v2.ts';
import type { IdentityLink, LoginAccount, LoginSession } from '../identity/login-model.ts';
import type { CharacterEntity, ContainerEntity, EquipmentEntity, ContainerSlotStack } from '../character/character-model.ts';
import type { ServiceContextEntity } from '../town/town-model.ts';
import type { WalletEntity, ShopCatalog } from './shop-model.ts';
import { DEFAULT_SHOP_CATALOG } from './shop-model.ts';
import {
  ShopRefusal,
  validateBuyEligibility,
  validateSellEligibility,
  calculateSellPrice,
  calculateExchange,
} from './shop-rules.ts';
import {
  parseAssetCommand,
  parseAssetResponse,
  parseAssetQuery,
  parseAssetQueryResponse,
} from '../../../shared/src/protocol/asset-v2.ts';
import type {
  AssetCommand,
  AssetResponse,
  AssetQuery,
  AssetQueryResponse,
  AssetCommandName,
} from '../../../shared/src/protocol/asset-v2.ts';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

interface Receipt {
  schemaVersion: 2;
  id: string;
  accountId: string;
  command: string;
  tuple: string;
  result: AssetResponse;
}

function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new ShopRefusal(code);
}

export interface ShopServiceOptions {
  store: Store;
  clock: Clock;
  identity: IdentityPort;
  catalog?: ShopCatalog;
}

export class ShopService {
  private readonly options: {
    store: Store;
    clock: Clock;
    identity: IdentityPort;
    catalog: ShopCatalog;
  };

  constructor(options: ShopServiceOptions) {
    this.options = {
      ...options,
      catalog: options.catalog ? structuredClone(options.catalog) : structuredClone(DEFAULT_SHOP_CATALOG),
    };
  }

  get catalog(): ShopCatalog {
    return this.options.catalog;
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
    return bag;
  }

  private async getWallet(tx: Transaction, account: LoginAccount): Promise<WalletEntity> {
    const wallet = await tx.get<WalletEntity>(account.walletId);
    requireValue(
      wallet?.schemaVersion === 2 &&
        wallet.id === account.walletId &&
        wallet.accountId === account.id,
      'CONFIG_NOT_READY',
    );
    return wallet;
  }

  async execute(value: unknown): Promise<AssetResponse> {
    const parsed = parseAssetCommand(value);
    if (parsed.command !== 'shop.buy' && parsed.command !== 'shop.sell' && parsed.command !== 'wallet.exchange') {
      throw new TypeError('UNSUPPORTED_COMMAND');
    }
    const command = parsed;
    const reply = (outcome: unknown, replayed = false) =>
      parseAssetResponse(command.command, {
        operationId: command.operationId,
        serverTime: time(this.options.clock.now()),
        replayed,
        outcome,
      });

    let caller: Awaited<ReturnType<ShopService['caller']>>;
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

        const now = time(this.options.clock.now());
        const nowMs = this.options.clock.now();
        const character = await this.getCharacter(tx, account, command.payload.characterId);
        const bag = await this.getBag(tx, account, character);
        const wallet = await this.getWallet(tx, account);

        // Version expectation checks if supplied
        for (const exp of command.expected) {
          if (exp.kind === 'character' && exp.id === character.id && exp.version !== character.version) {
            return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
          }
          if (exp.kind === 'container' && exp.id === bag.id && exp.version !== bag.version) {
            return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
          }
          if (exp.kind === 'wallet' && exp.id === wallet.id && exp.version !== wallet.version) {
            return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
          }
        }

        let outcome: unknown;

        try {
          if (command.command === 'shop.buy') {
            const { contextId, offerId, quantity, quoteRef } = command.payload;

            // Verify NPC shop context
            const ctx = await tx.get<ServiceContextEntity>(contextId);
            requireValue(
              ctx?.schemaVersion === 2 &&
                ctx.id === contextId &&
                ctx.accountId === account.id &&
                ctx.characterId === character.id &&
                ctx.status === 'open' &&
                (ctx.serviceKind === 'shop' || ctx.serviceKind === 'pointsShop'),
              'CONTEXT_INVALID',
            );

            const offer = this.options.catalog.offers[offerId];
            requireValue(offer, 'CONFIG_NOT_READY');

            // Eligibility & price calculation
            const { cost, priceCurrency } = validateBuyEligibility(
              offer,
              quantity,
              quoteRef,
              wallet,
              this.options.catalog.quoteRef,
            );

            // Space check
            if (offer.itemKind === 'potion') {
              const maxStack = 99;
              const targetBindingKind = priceCurrency === 'points' ? 'account' : 'none';

              // Existing matching stacks
              let availableInExisting = 0;
              const existingStackEntries: Array<[number, ContainerSlotStack]> = [];
              for (const [idxStr, slot] of Object.entries(bag.slots)) {
                if (
                  slot.kind === 'stack' &&
                  slot.templateRef.id === offer.templateId &&
                  slot.binding.kind === targetBindingKind
                ) {
                  existingStackEntries.push([Number(idxStr), slot]);
                  availableInExisting += maxStack - slot.quantity;
                }
              }

              let neededNewSlots = 0;
              if (quantity > availableInExisting) {
                const remaining = quantity - availableInExisting;
                neededNewSlots = Math.ceil(remaining / maxStack);
              }

              // Count free slots in 0..bag.capacity-1
              const freeSlotIndices: number[] = [];
              for (let i = 0; i < bag.capacity; i++) {
                if (!bag.slots[i]) freeSlotIndices.push(i);
              }

              if (freeSlotIndices.length < neededNewSlots) {
                throw new ShopRefusal('BAG_FULL');
              }

              // Distribute quantity into bag
              let toDistribute = quantity;
              // 1. Fill existing stacks
              for (const [_, stack] of existingStackEntries) {
                if (toDistribute <= 0) break;
                const canTake = Math.min(toDistribute, maxStack - stack.quantity);
                stack.quantity += canTake;
                toDistribute -= canTake;
              }
              // 2. Put into new slots
              let freeIdx = 0;
              while (toDistribute > 0) {
                const slotIdx = freeSlotIndices[freeIdx++];
                const take = Math.min(toDistribute, maxStack);
                const stackId = await loginKey('stack', [bag.id, slotIdx, nowMs]);
                bag.slots[slotIdx] = {
                  kind: 'stack',
                  stackId,
                  templateRef: { id: offer.templateId, version: 1 },
                  quantity: take,
                  binding:
                    priceCurrency === 'points'
                      ? { kind: 'account', accountId: account.id }
                      : { kind: 'none' },
                  traceRef: `shop_buy_${offerId}_${nowMs}`,
                };
                toDistribute -= take;
              }
            } else {
              // Equipment requires 1 slot per item
              const freeSlotIndices: number[] = [];
              for (let i = 0; i < bag.capacity; i++) {
                if (!bag.slots[i]) freeSlotIndices.push(i);
              }

              if (freeSlotIndices.length < quantity) {
                throw new ShopRefusal('BAG_FULL');
              }

              for (let i = 0; i < quantity; i++) {
                const slotIdx = freeSlotIndices[i];
                const itemId = await loginKey('item', [bag.id, slotIdx, nowMs, i]);
                const item: EquipmentEntity = {
                  schemaVersion: 2,
                  id: itemId,
                  accountId: account.id,
                  holderCharacterId: character.id,
                  sourceKey: `shop:${offer.offerId}`,
                  sourceOrdinal: i + 1,
                  sourceLocator: { kind: 'grant', grantId: `shop_${offer.offerId}_${nowMs}` },
                  templateRef: { id: offer.templateId, version: 1 },
                  slotKind: offer.slotKind ?? 'weapon',
                  itemLevel: offer.itemLevel ?? 1,
                  quality: offer.quality,
                  rolledAffixes: [],
                  setRef: null,
                  binding:
                    priceCurrency === 'points'
                      ? { kind: 'account', accountId: account.id }
                      : { kind: 'none' },
                  enhancementLevel: 0,
                  durability: {
                    wearEnabled: ['weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots', 'earring'].includes(
                      offer.slotKind ?? 'weapon',
                    ),
                    current: ['weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots', 'earring'].includes(
                      offer.slotKind ?? 'weapon',
                    )
                      ? 100
                      : null,
                    max: ['weapon', 'shoulder', 'chest', 'pants', 'belt', 'boots', 'earring'].includes(
                      offer.slotKind ?? 'weapon',
                    )
                      ? 100
                      : null,
                    policyRef: 'standard_wear_v1',
                  },
                  location: { kind: 'container', containerId: bag.id },
                  lifecycle: 'active',
                  version: 0,
                  createdAt: now,
                  updatedAt: now,
                };
                tx.set(itemId, item);
                bag.slots[slotIdx] = {
                  kind: 'equipment',
                  itemId,
                  sortHeader: { itemLevel: item.itemLevel, quality: item.quality, slotKind: item.slotKind },
                };
              }
            }

            // Deduct wallet
            if (priceCurrency === 'gold') {
              wallet.gold = (BigInt(wallet.gold) - cost).toString();
            } else {
              wallet.points = (BigInt(wallet.points) - cost).toString();
            }
            wallet.version++;
            wallet.updatedAt = now;
            tx.set(wallet.id, wallet);

            bag.version++;
            bag.updatedAt = now;
            tx.set(bag.id, bag);

            character.version++;
            character.updatedAt = now;
            tx.set(character.id, character);

            outcome = {
              status: 'committed',
              data: { deliveredQuantity: quantity, sourceRef: offer.offerId },
              resultVersions: [
                { kind: 'character', id: character.id, version: character.version },
                { kind: 'container', id: bag.id, version: bag.version },
                { kind: 'wallet', id: wallet.id, version: wallet.version },
              ],
            };
          } else if (command.command === 'shop.sell') {
            const { contextId, target, quantity } = command.payload;

            // Verify NPC shop context
            const ctx = await tx.get<ServiceContextEntity>(contextId);
            requireValue(
              ctx?.schemaVersion === 2 &&
                ctx.id === contextId &&
                ctx.accountId === account.id &&
                ctx.characterId === character.id &&
                ctx.status === 'open' &&
                ctx.serviceKind === 'shop',
              'CONTEXT_INVALID',
            );

            let gainGold = 0n;

            if (target.kind === 'equipment') {
              requireValue(quantity === 1, 'INVALID_EQUIPMENT_QUANTITY');

              // Must be in bag
              const slotEntry = Object.entries(bag.slots).find(
                ([_, s]) => s.kind === 'equipment' && s.itemId === target.itemId,
              );
              requireValue(slotEntry, 'LOCATION_NOT_ALLOWED');
              const slotIdx = Number(slotEntry[0]);

              const item = await tx.get<EquipmentEntity>(target.itemId);
              requireValue(
                item?.schemaVersion === 2 &&
                  item.id === target.itemId &&
                  item.accountId === account.id &&
                  item.lifecycle === 'active',
                'ITEM_NOT_ELIGIBLE',
              );

              validateSellEligibility(item, false, 'backpack');
              gainGold = calculateSellPrice(item, 1);

              item.lifecycle = 'sold';
              item.version++;
              item.updatedAt = now;
              tx.set(item.id, item);

              delete bag.slots[slotIdx];
            } else {
              // Stack
              const slotEntry = Object.entries(bag.slots).find(
                ([_, s]) => s.kind === 'stack' && s.stackId === target.stackId,
              );
              requireValue(slotEntry, 'LOCATION_NOT_ALLOWED');
              const slotIdx = Number(slotEntry[0]);
              const stack = slotEntry[1] as ContainerSlotStack;

              requireValue(stack.quantity >= quantity, 'INVALID_ARGUMENT');
              validateSellEligibility(stack, false, 'backpack');
              gainGold = calculateSellPrice(stack, quantity);

              if (stack.quantity === quantity) {
                delete bag.slots[slotIdx];
              } else {
                stack.quantity -= quantity;
              }
            }

            // Credit gold to wallet
            wallet.gold = (BigInt(wallet.gold) + gainGold).toString();
            wallet.version++;
            wallet.updatedAt = now;
            tx.set(wallet.id, wallet);

            bag.version++;
            bag.updatedAt = now;
            tx.set(bag.id, bag);

            character.version++;
            character.updatedAt = now;
            tx.set(character.id, character);

            outcome = {
              status: 'committed',
              data: { soldQuantity: quantity, sourceRef: 'shop_sell' },
              resultVersions: [
                { kind: 'character', id: character.id, version: character.version },
                { kind: 'container', id: bag.id, version: bag.version },
                { kind: 'wallet', id: wallet.id, version: wallet.version },
              ],
            };
          } else if (command.command === 'wallet.exchange') {
            const { fromCurrency, exchangeUnits, contextId } = command.payload;

            if (contextId) {
              const ctx = await tx.get<ServiceContextEntity>(contextId);
              requireValue(
                ctx?.schemaVersion === 2 &&
                  ctx.id === contextId &&
                  ctx.accountId === account.id &&
                  ctx.characterId === character.id &&
                  ctx.status === 'open',
                'CONTEXT_INVALID',
              );
            }

            const { nextGold, nextPoints } = calculateExchange(fromCurrency, exchangeUnits, wallet);

            wallet.gold = nextGold;
            wallet.points = nextPoints;
            wallet.version++;
            wallet.updatedAt = now;
            tx.set(wallet.id, wallet);

            character.version++;
            character.updatedAt = now;
            tx.set(character.id, character);

            outcome = {
              status: 'committed',
              data: { fromCurrency, exchangeUnits },
              resultVersions: [
                { kind: 'character', id: character.id, version: character.version },
                { kind: 'wallet', id: wallet.id, version: wallet.version },
              ],
            };
          }
        } catch (err) {
          if (err instanceof ShopRefusal) {
            outcome = { status: 'rejected', code: err.code };
          } else {
            throw err;
          }
        }

        const response = parseAssetResponse(command.command, {
          operationId: command.operationId,
          serverTime: now,
          replayed: false,
          outcome,
        });

        const receipt: Receipt = {
          schemaVersion: 2,
          id: opId,
          accountId: account.id,
          command: command.command,
          tuple,
          result: response,
        };
        tx.set(opId, receipt);

        tx.set(journalId, {
          schemaVersion: 2,
          id: journalId,
          accountId: account.id,
          operationId: command.operationId,
          command: command.command,
          occurredAt: now,
        });

        return response;
      });
    } catch (err) {
      if (err instanceof ShopRefusal) {
        return reply({ status: 'rejected', code: err.code });
      }
      if (err instanceof CommitUnknown) {
        return {
          operationId: command.operationId,
          serverTime: time(this.options.clock.now()),
          replayed: false,
          outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' },
        };
      }
      if (err instanceof StoreUnavailable) {
        return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
      }
      throw err;
    }
  }

  async query(value: unknown): Promise<AssetQueryResponse> {
    const parsed = parseAssetQuery(value);
    const query = parsed;
    const now = time(this.options.clock.now());

    let caller: Awaited<ReturnType<ShopService['caller']>>;
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
      const account = await this.authorize(tx, caller, query.sessionId, query.sessionEpoch);

      if (query.query === 'account.get') {
        const wallet = await this.getWallet(tx, account);
        const characters = await Promise.all(
          Object.values(account.characterIdsByClass).map(async cid => {
            const c = (await tx.get<CharacterEntity>(cid))!;
            return {
              characterId: c.id,
              classId: c.classId,
              characterName: c.characterName,
              level: c.level,
            };
          }),
        );

        return parseAssetQueryResponse('account.get', {
          requestId: query.requestId,
          serverTime: now,
          versions: [{ kind: 'account', id: account.id, version: account.writeRevision }],
          data: {
            characters,
            selectedCharacterId: account.selectedCharacterId ?? null,
            wallet: { gold: wallet.gold, points: wallet.points },
            activeChallengeId: account.activeChallengeId ?? null,
            openSceneChallengeId: account.openSceneChallengeId ?? null,
          },
        });
      }

      if (query.query === 'operation.get') {
        const { operationId } = query.payload;
        const opId = await loginKey('assetOp', [account.id, operationId]);
        const receipt = await tx.get<Receipt>(opId);

        if (!receipt) {
          return parseAssetQueryResponse('operation.get', {
            requestId: query.requestId,
            serverTime: now,
            versions: [],
            data: { status: 'notFound' },
          });
        }

        return parseAssetQueryResponse('operation.get', {
          requestId: query.requestId,
          serverTime: now,
          versions: [],
          data: {
            status: 'found',
            command: receipt.command as any,
            result: receipt.result,
          },
        });
      }

      throw new TypeError(`UNSUPPORTED_QUERY: ${query.query}`);
    });
  }
}
