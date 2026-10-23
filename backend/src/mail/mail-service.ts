import { time } from '../../../shared/src/exact-values.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable } from '../ports/store.ts';
import type { IdentityPort } from '../identity/identity-v2.ts';
import { identityKey, isVerifiedIdentity } from '../identity/identity-v2.ts';
import type { IdentityLink, LoginAccount, LoginSession } from '../identity/login-model.ts';
import type {
  CharacterEntity,
  ContainerEntity,
  EquipmentEntity,
  MailEntity,
  RewardGrantEntity,
} from '../character/character-model.ts';
import type { ServiceContextEntity } from '../town/town-model.ts';
import { characterKey } from '../character/character-service.ts';
import {
  isMailExpired,
  canDeleteMail,
  calculateStackClaimQuantity,
  canClaimEquipmentAttachment,
  MAX_STACK_QUANTITY,
} from './mail-rules.ts';
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
} from '../../../shared/src/protocol/asset-v2.ts';

export class MailRefusal extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'MailRefusal';
    this.code = code;
  }
}

function requireValue(value: unknown, code: string): asserts value {
  if (!value) throw new MailRefusal(code);
}

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

interface AssetJournalEntity {
  schemaVersion: 2;
  id: string;
  accountId: string;
  operationId: string;
  asset: string;
  entries: Array<{
    sourceLocator: Record<string, unknown>;
    deliveredQuantity: number;
  }>;
  createdAt: number;
}

export interface MailServiceOptions {
  store: Store;
  clock: Clock;
  identity: IdentityPort;
}

export class MailService {
  private readonly options: MailServiceOptions;

  constructor(options: MailServiceOptions) {
    this.options = { ...options };
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
        session &&
        session.schemaVersion === 2 &&
        session.accountId === account.id &&
        session.status === 'active' &&
        session.epoch === epoch,
      'SESSION_REVOKED',
    );
    return account;
  }

  private async getCharacter(
    tx: Transaction,
    account: LoginAccount,
    characterId: string,
  ): Promise<CharacterEntity> {
    const character = await tx.get<CharacterEntity>(characterId);
    requireValue(
      character &&
        character.schemaVersion === 2 &&
        character.accountId === account.id &&
        character.id === characterId,
      'NOT_FOUND_OR_FORBIDDEN',
    );
    return character;
  }

  private async getBag(
    tx: Transaction,
    account: LoginAccount,
    character: CharacterEntity,
  ): Promise<ContainerEntity> {
    const bag = await tx.get<ContainerEntity>(character.backpackId);
    requireValue(
      bag &&
        bag.schemaVersion === 2 &&
        bag.accountId === account.id &&
        bag.characterId === character.id &&
        bag.kind === 'backpack',
      'NOT_FOUND_OR_FORBIDDEN',
    );
    return bag;
  }

  private async verifyMailboxContext(
    tx: Transaction,
    account: LoginAccount,
    character: CharacterEntity,
    contextId: string,
  ): Promise<ServiceContextEntity> {
    const ctx = await tx.get<ServiceContextEntity>(contextId);
    requireValue(
      ctx?.schemaVersion === 2 &&
        ctx.id === contextId &&
        ctx.accountId === account.id &&
        ctx.characterId === character.id &&
        ctx.status === 'open' &&
        ctx.serviceKind === 'mailbox',
      'CONTEXT_INVALID',
    );
    return ctx;
  }

  private async getMailsForCharacter(
    tx: Transaction,
    account: LoginAccount,
    character: CharacterEntity,
  ): Promise<MailEntity[]> {
    const mailIds = new Set<string>(character.mailIds ?? []);
    // Fallback check for novice mail if not recorded in character.mailIds
    const noviceMailId = await characterKey('mail', [account.id, character.classId, 'novice-gift']);
    mailIds.add(noviceMailId);

    const mails: MailEntity[] = [];
    for (const mailId of mailIds) {
      const mail = await tx.get<MailEntity>(mailId);
      if (mail && mail.schemaVersion === 2 && mail.characterId === character.id) {
        mails.push(mail);
      }
    }
    return mails;
  }

  private async getGrantsForCharacter(
    tx: Transaction,
    character: CharacterEntity,
  ): Promise<RewardGrantEntity[]> {
    const grantIds = new Set<string>(character.pendingGrantIds ?? []);
    const grants: RewardGrantEntity[] = [];
    for (const grantId of grantIds) {
      const grant = await tx.get<RewardGrantEntity>(grantId);
      if (grant && grant.schemaVersion === 2 && grant.characterId === character.id) {
        grants.push(grant);
      }
    }
    return grants;
  }

  async execute(rawInput: unknown): Promise<AssetResponse> {
    let command: AssetCommand;
    try {
      command = parseAssetCommand(rawInput);
    } catch {
      return parseAssetResponse('mail.markRead', {
        operationId: typeof (rawInput as any)?.operationId === 'string' ? (rawInput as any).operationId : 'op-invalid',
        serverTime: time(this.options.clock.now()),
        replayed: false,
        outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
      });
    }

    const { command: cmdName, operationId, sessionId, sessionEpoch, payload } = command;
    const caller = await this.caller();
    const tuple = canonical(payload);
    const nowMs = this.options.clock.now();

    const reply = (outcome: unknown): AssetResponse =>
      parseAssetResponse(cmdName, {
        operationId,
        serverTime: time(this.options.clock.now()),
        replayed: false,
        outcome,
      });

    try {
      return await this.options.store.run(async tx => {
        let account: LoginAccount;
        try {
          account = await this.authorize(tx, caller, sessionId, sessionEpoch);
        } catch (e: any) {
          if (e instanceof MailRefusal) return reply({ status: 'rejected', code: e.code });
          throw e;
        }

        const receiptId = `op:${account.id}:${operationId}`;
        const previous = await tx.get<Receipt>(receiptId);
        if (previous) {
          if (previous.tuple !== tuple) return reply({ status: 'rejected', code: 'OPERATION_MISMATCH' });
          return parseAssetResponse(cmdName, {
            ...previous.result,
            serverTime: time(this.options.clock.now()),
            replayed: true,
          });
        }

        const journalId = `j:${account.id}:${operationId}`;
        const priorJournal = await tx.get(journalId);
        if (priorJournal !== undefined) return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });

        const character = await this.getCharacter(tx, account, (payload as any).characterId);

        // Check version expectation if provided
        for (const exp of command.expected) {
          if (exp.kind === 'character' && exp.id === character.id && exp.version !== character.version) {
            return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
          }
        }

        let outcome: unknown;

        try {
          if (cmdName === 'mail.markRead') {
            const p = payload as { characterId: string; contextId: string; mailId: string };
            await this.verifyMailboxContext(tx, account, character, p.contextId);

            const mail = await tx.get<MailEntity>(p.mailId);
            requireValue(
              mail &&
                mail.schemaVersion === 2 &&
                mail.characterId === character.id &&
                mail.status !== 'deleted',
              'NOT_FOUND_OR_FORBIDDEN',
            );

            // Verify expected version if present
            for (const exp of command.expected) {
              if (exp.kind === 'mail' && exp.id === mail.id && exp.version !== mail.version) {
                return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
              }
            }

            // Mark read if not already marked; createdAt MUST remain unchanged
            if (mail.readAt == null) {
              mail.readAt = nowMs;
              mail.version = (mail.version ?? 0) + 1;
              mail.updatedAt = nowMs;
              tx.set(mail.id, mail);
            }

            outcome = {
              status: 'committed',
              data: { mailId: mail.id, read: true },
              resultVersions: [{ kind: 'mail', id: mail.id, version: mail.version }],
            };
          } else if (cmdName === 'mail.delete') {
            const p = payload as { characterId: string; contextId: string; mailId: string };
            await this.verifyMailboxContext(tx, account, character, p.contextId);

            const mail = await tx.get<MailEntity>(p.mailId);
            requireValue(
              mail &&
                mail.schemaVersion === 2 &&
                mail.characterId === character.id &&
                mail.status !== 'deleted',
              'NOT_FOUND_OR_FORBIDDEN',
            );

            for (const exp of command.expected) {
              if (exp.kind === 'mail' && exp.id === mail.id && exp.version !== mail.version) {
                return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
              }
            }

            // Anti-deletion guard
            if (!canDeleteMail(mail)) {
              throw new MailRefusal('UNCLAIMED_ATTACHMENTS');
            }

            // Logical deletion while preserving sourceKey stub
            mail.status = 'deleted';
            mail.version = (mail.version ?? 0) + 1;
            mail.updatedAt = nowMs;
            tx.set(mail.id, mail);

            outcome = {
              status: 'committed',
              data: { mailId: mail.id, deleted: true },
              resultVersions: [{ kind: 'mail', id: mail.id, version: mail.version }],
            };
          } else if (cmdName === 'mail.claimAttachment') {
            const p = payload as { characterId: string; contextId: string; mailId: string; attachmentId: string };
            await this.verifyMailboxContext(tx, account, character, p.contextId);

            const mail = await tx.get<MailEntity>(p.mailId);
            requireValue(
              mail &&
                mail.schemaVersion === 2 &&
                mail.characterId === character.id &&
                mail.status !== 'deleted',
              'NOT_FOUND_OR_FORBIDDEN',
            );

            if (isMailExpired(mail, nowMs)) {
              throw new MailRefusal('MAIL_EXPIRED');
            }

            const attachment = mail.attachments.find(a => a.attachmentId === p.attachmentId);
            requireValue(attachment, 'NOT_FOUND_OR_FORBIDDEN');

            if (attachment.quantityClaimed >= attachment.quantityGranted || attachment.state === 'claimed') {
              throw new MailRefusal('ALREADY_DELIVERED');
            }

            const bag = await this.getBag(tx, account, character);

            for (const exp of command.expected) {
              if (exp.kind === 'mail' && exp.id === mail.id && exp.version !== mail.version) {
                return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
              }
              if (exp.kind === 'container' && exp.id === bag.id && exp.version !== bag.version) {
                return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
              }
            }

            let deliveredQuantity = 0;
            let newEquipmentId: string | null = null;

            if (attachment.kind === 'stack') {
              const remaining = attachment.quantityGranted - attachment.quantityClaimed;
              deliveredQuantity = calculateStackClaimQuantity(
                remaining,
                attachment.templateRef,
                attachment.binding,
                bag,
              );
              if (deliveredQuantity <= 0) {
                throw new MailRefusal('BAG_FULL');
              }

              let toDistribute = deliveredQuantity;

              // 1. Fill existing matching stacks
              for (const slot of Object.values(bag.slots)) {
                if (toDistribute <= 0) break;
                if (
                  slot &&
                  slot.kind === 'stack' &&
                  slot.templateRef.id === attachment.templateRef.id &&
                  slot.binding.kind === attachment.binding.kind &&
                  slot.binding.accountId === attachment.binding.accountId &&
                  slot.binding.characterId === attachment.binding.characterId &&
                  slot.quantity < MAX_STACK_QUANTITY
                ) {
                  const take = Math.min(toDistribute, MAX_STACK_QUANTITY - slot.quantity);
                  slot.quantity += take;
                  toDistribute -= take;
                }
              }

              // 2. Put into free slots
              if (toDistribute > 0) {
                for (let i = 0; i < bag.capacity && toDistribute > 0; i++) {
                  if (bag.slots[i] === undefined) {
                    const take = Math.min(toDistribute, MAX_STACK_QUANTITY);
                    const stackId = `stk-mail-${mail.id}-${attachment.attachmentId}-${i}`;
                    bag.slots[i] = {
                      kind: 'stack',
                      stackId,
                      templateRef: { ...attachment.templateRef },
                      quantity: take,
                      binding: { ...attachment.binding },
                      traceRef: `tr-mail-${operationId}`,
                    };
                    toDistribute -= take;
                  }
                }
              }

              attachment.quantityClaimed += deliveredQuantity;
              attachment.state =
                attachment.quantityClaimed === attachment.quantityGranted
                  ? 'claimed'
                  : 'partially_claimed';
            } else if (attachment.kind === 'equipment') {
              if (!canClaimEquipmentAttachment(bag)) {
                throw new MailRefusal('BAG_FULL');
              }

              let emptySlot = -1;
              for (let i = 0; i < bag.capacity; i++) {
                if (bag.slots[i] === undefined) {
                  emptySlot = i;
                  break;
                }
              }
              if (emptySlot === -1) {
                throw new MailRefusal('BAG_FULL');
              }

              const itemId = `eq-mail-${mail.id}-${attachment.attachmentId}`;
              newEquipmentId = itemId;
              const pEquipment = attachment.equipmentPayload;

              const equipment: EquipmentEntity = {
                schemaVersion: 2,
                id: itemId,
                accountId: account.id,
                holderCharacterId: character.id,
                sourceKey: mail.sourceKey,
                sourceOrdinal: 0,
                sourceLocator: {
                  kind: 'mailAttachment',
                  mailId: mail.id,
                  attachmentId: attachment.attachmentId,
                },
                templateRef: { ...attachment.templateRef },
                slotKind: pEquipment?.slotKind ?? 'weapon',
                itemLevel: pEquipment?.itemLevel ?? 10,
                quality: pEquipment?.quality ?? 'white',
                rolledAffixes: pEquipment?.affixes ?? [],
                setRef: null,
                binding: { ...attachment.binding },
                enhancementLevel: pEquipment?.enhancementLevel ?? 0,
                durability: {
                  wearEnabled: true,
                  current: 100,
                  max: 100,
                  policyRef: 'test-wear-v1',
                },
                location: { kind: 'container', containerId: bag.id },
                lifecycle: 'active',
                version: 0,
                createdAt: nowMs,
                updatedAt: nowMs,
              };
              tx.set(itemId, equipment);

              bag.slots[emptySlot] = {
                kind: 'equipment',
                itemId,
                sortHeader: {
                  itemLevel: equipment.itemLevel,
                  quality: equipment.quality,
                  slotKind: equipment.slotKind,
                },
              };

              attachment.quantityClaimed = 1;
              attachment.state = 'claimed';
              deliveredQuantity = 1;
            }

            mail.version = (mail.version ?? 0) + 1;
            mail.updatedAt = nowMs;
            tx.set(mail.id, mail);

            bag.version++;
            bag.updatedAt = nowMs;
            tx.set(bag.id, bag);

            const journal: AssetJournalEntity = {
              schemaVersion: 2,
              id: journalId,
              accountId: account.id,
              operationId,
              asset: 'mail',
              entries: [
                {
                  sourceLocator: {
                    kind: 'mailAttachment',
                    mailId: mail.id,
                    attachmentId: attachment.attachmentId,
                  },
                  deliveredQuantity,
                },
              ],
              createdAt: nowMs,
            };
            tx.set(journalId, journal);

            const resultVersions: import('../../../shared/src/protocol/session-v2.ts').Expected[] = [
              { kind: 'mail', id: mail.id, version: mail.version },
              { kind: 'container', id: bag.id, version: bag.version },
            ];
            if (newEquipmentId) {
              resultVersions.push({ kind: 'equipment', id: newEquipmentId, version: 0 });
            }

            outcome = {
              status: 'committed',
              data: {
                mailId: mail.id,
                attachmentId: attachment.attachmentId,
                deliveredQuantity,
              },
              resultVersions,
            };
          } else if (cmdName === 'reward.claim') {
            const p = payload as { characterId: string; contextId: string; grantId: string };
            await this.verifyMailboxContext(tx, account, character, p.contextId);

            const grant = await tx.get<RewardGrantEntity>(p.grantId);
            requireValue(
              grant &&
                grant.schemaVersion === 2 &&
                grant.characterId === character.id &&
                grant.accountId === account.id,
              'NOT_FOUND_OR_FORBIDDEN',
            );

            if (grant.deliveryState === 'delivered') {
              throw new MailRefusal('ALREADY_DELIVERED');
            }

            const bag = await this.getBag(tx, account, character);

            for (const exp of command.expected) {
              if (exp.kind === 'grant' && exp.id === grant.id && exp.version !== grant.version) {
                return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
              }
              if (exp.kind === 'container' && exp.id === bag.id && exp.version !== bag.version) {
                return reply({ status: 'rejected', code: 'VERSION_CONFLICT' });
              }
            }

            if (!canClaimEquipmentAttachment(bag)) {
              throw new MailRefusal('BAG_FULL');
            }

            let emptySlot = -1;
            for (let i = 0; i < bag.capacity; i++) {
              if (bag.slots[i] === undefined) {
                emptySlot = i;
                break;
              }
            }
            if (emptySlot === -1) {
              throw new MailRefusal('BAG_FULL');
            }

            const equipment = await tx.get<EquipmentEntity>(grant.payload.itemId);
            requireValue(
              equipment &&
                equipment.schemaVersion === 2 &&
                equipment.location.kind === 'pending' &&
                equipment.location.grantId === grant.id,
              'NOT_FOUND_OR_FORBIDDEN',
            );

            // Materialize directly into bag
            equipment.location = { kind: 'container', containerId: bag.id };
            equipment.version = (equipment.version ?? 0) + 1;
            equipment.updatedAt = nowMs;
            tx.set(equipment.id, equipment);

            bag.slots[emptySlot] = {
              kind: 'equipment',
              itemId: equipment.id,
              sortHeader: {
                itemLevel: equipment.itemLevel,
                quality: equipment.quality,
                slotKind: equipment.slotKind,
              },
            };
            bag.version++;
            bag.updatedAt = nowMs;
            tx.set(bag.id, bag);

            grant.deliveryState = 'delivered';
            grant.deliveredAt = nowMs;
            grant.version = (grant.version ?? 0) + 1;
            tx.set(grant.id, grant);

            const journal: AssetJournalEntity = {
              schemaVersion: 2,
              id: journalId,
              accountId: account.id,
              operationId,
              asset: 'reward',
              entries: [
                {
                  sourceLocator: {
                    kind: 'grant',
                    grantId: grant.id,
                  },
                  deliveredQuantity: 1,
                },
              ],
              createdAt: nowMs,
            };
            tx.set(journalId, journal);

            outcome = {
              status: 'committed',
              data: {
                grantId: grant.id,
                itemId: equipment.id,
                state: 'delivered',
              },
              resultVersions: [
                { kind: 'grant' as const, id: grant.id, version: grant.version },
                { kind: 'container' as const, id: bag.id, version: bag.version },
                { kind: 'equipment' as const, id: equipment.id, version: equipment.version },
              ],
            };
          } else {
            throw new MailRefusal('UNSUPPORTED_PROTOCOL');
          }
        } catch (e: any) {
          if (e instanceof MailRefusal) {
            outcome = { status: 'rejected', code: e.code };
          } else {
            throw e;
          }
        }

        const finalResult = reply(outcome);
        tx.set(receiptId, {
          schemaVersion: 2,
          id: receiptId,
          accountId: account.id,
          command: cmdName,
          tuple,
          result: finalResult,
        });

        return finalResult;
      });
    } catch (e: any) {
      if (e instanceof CommitUnknown) {
        return reply({ status: 'unknown', code: 'RESULT_UNKNOWN' });
      }
      if (e instanceof StoreUnavailable) {
        return reply({ status: 'rejected', code: 'SERVICE_UNAVAILABLE' });
      }
      throw e;
    }
  }

  async getMailList(rawInput: unknown): Promise<AssetQueryResponse<'mail.list'>> {
    const query = parseAssetQuery(rawInput);
    if (query.query !== 'mail.list') throw new TypeError('UNSUPPORTED_QUERY');

    const { requestId, sessionId, sessionEpoch, payload } = query;
    const { characterId, contextId } = payload;
    const caller = await this.caller();
    const nowMs = this.options.clock.now();

    return await this.options.store.run(async tx => {
      let account: LoginAccount;
      try {
        account = await this.authorize(tx, caller, sessionId, sessionEpoch);
      } catch (e: any) {
        return parseAssetQueryResponse('mail.list', {
          requestId,
          serverTime: time(nowMs),
          error: { code: e instanceof MailRefusal ? (e.code as any) : 'AUTH_REQUIRED' },
        });
      }

      let character: CharacterEntity;
      try {
        character = await this.getCharacter(tx, account, characterId);
      } catch {
        return parseAssetQueryResponse('mail.list', {
          requestId,
          serverTime: time(nowMs),
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      try {
        await this.verifyMailboxContext(tx, account, character, contextId);
      } catch {
        return parseAssetQueryResponse('mail.list', {
          requestId,
          serverTime: time(nowMs),
          error: { code: 'CONTEXT_INVALID' },
        });
      }

      const mails = await this.getMailsForCharacter(tx, account, character);
      const activeMails = mails.filter(m => m.status !== 'deleted');
      activeMails.sort((a, b) => b.createdAt - a.createdAt);

      const entries = activeMails.map(mail => ({
        mailId: mail.id,
        characterId: mail.characterId,
        createdAt: time(mail.createdAt),
        expiresAt: time(mail.expiresAt),
        read: mail.readAt != null,
        attachments: mail.attachments.map(a => ({
          attachmentId: a.attachmentId,
          kind: a.kind,
          templateRef: a.templateRef.id,
          quantityGranted: a.quantityGranted,
          quantityClaimed: a.quantityClaimed,
          binding:
            a.binding.kind === 'character'
              ? { kind: 'character' as const, characterId: a.binding.characterId! }
              : { kind: a.binding.kind as 'none' | 'account' },
        })),
      }));

      return parseAssetQueryResponse('mail.list', {
        requestId,
        serverTime: time(nowMs),
        versions: [],
        data: {
          entries,
          nextCursor: null,
        },
      });
    });
  }

  async getRewardList(rawInput: unknown): Promise<AssetQueryResponse<'reward.list'>> {
    const query = parseAssetQuery(rawInput);
    if (query.query !== 'reward.list') throw new TypeError('UNSUPPORTED_QUERY');

    const { requestId, sessionId, sessionEpoch, payload } = query;
    const { characterId, contextId } = payload;
    const caller = await this.caller();
    const nowMs = this.options.clock.now();

    return await this.options.store.run(async tx => {
      let account: LoginAccount;
      try {
        account = await this.authorize(tx, caller, sessionId, sessionEpoch);
      } catch (e: any) {
        return parseAssetQueryResponse('reward.list', {
          requestId,
          serverTime: time(nowMs),
          error: { code: e instanceof MailRefusal ? (e.code as any) : 'AUTH_REQUIRED' },
        });
      }

      let character: CharacterEntity;
      try {
        character = await this.getCharacter(tx, account, characterId);
      } catch {
        return parseAssetQueryResponse('reward.list', {
          requestId,
          serverTime: time(nowMs),
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      try {
        await this.verifyMailboxContext(tx, account, character, contextId);
      } catch {
        return parseAssetQueryResponse('reward.list', {
          requestId,
          serverTime: time(nowMs),
          error: { code: 'CONTEXT_INVALID' },
        });
      }

      const grants = await this.getGrantsForCharacter(tx, character);
      grants.sort((a, b) => b.createdAt - a.createdAt);

      const entries = grants.map(grant => ({
        grantId: grant.id,
        itemId: grant.payload.itemId,
        characterId: grant.characterId,
        createdAt: time(grant.createdAt),
        state: grant.deliveryState === 'available' ? ('pending' as const) : ('delivered' as const),
      }));

      return parseAssetQueryResponse('reward.list', {
        requestId,
        serverTime: time(nowMs),
        versions: [],
        data: {
          entries,
          nextCursor: null,
        },
      });
    });
  }

  async getDeliverySummary(rawInput: unknown): Promise<AssetQueryResponse<'delivery.summary'>> {
    const query = parseAssetQuery(rawInput);
    if (query.query !== 'delivery.summary') throw new TypeError('UNSUPPORTED_QUERY');

    const { requestId, sessionId, sessionEpoch, payload } = query;
    const { characterId } = payload;
    const caller = await this.caller();
    const nowMs = this.options.clock.now();

    return await this.options.store.run(async tx => {
      let account: LoginAccount;
      try {
        account = await this.authorize(tx, caller, sessionId, sessionEpoch);
      } catch (e: any) {
        return parseAssetQueryResponse('delivery.summary', {
          requestId,
          serverTime: time(nowMs),
          error: { code: e instanceof MailRefusal ? (e.code as any) : 'AUTH_REQUIRED' },
        });
      }

      let character: CharacterEntity;
      try {
        character = await this.getCharacter(tx, account, characterId);
      } catch {
        return parseAssetQueryResponse('delivery.summary', {
          requestId,
          serverTime: time(nowMs),
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      const mails = await this.getMailsForCharacter(tx, account, character);
      let unreadMailCount = 0;
      for (const mail of mails) {
        if (mail.status !== 'deleted' && nowMs < mail.expiresAt) {
          const isUnread = mail.readAt == null;
          const hasUnclaimed = mail.attachments.some(a => a.quantityClaimed < a.quantityGranted);
          if (isUnread || hasUnclaimed) {
            unreadMailCount++;
          }
        }
      }

      const grants = await this.getGrantsForCharacter(tx, character);
      const pendingCount = grants.filter(g => g.deliveryState === 'available').length;

      return parseAssetQueryResponse('delivery.summary', {
        requestId,
        serverTime: time(nowMs),
        versions: [],
        data: {
          unreadMailCount,
          pendingCount,
          asOf: time(nowMs),
        },
      });
    });
  }
}
