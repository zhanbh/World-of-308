import { parseCharacterCommand, parseCharacterResponse } from '../../../shared/src/protocol/session-v2.ts';
import type { CharacterCommand, CharacterResponse, Expected } from '../../../shared/src/protocol/session-v2.ts';
import { time } from '../../../shared/src/exact-values.ts';
import type { Store, Clock } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable } from '../ports/store.ts';
import type { LoginAccount, LoginSession } from '../identity/login-model.ts';
import type {
  CharacterNameOccupancy,
  CharacterEntity,
  ContainerEntity,
  EquipmentEntity,
  MailEntity,
  NoviceGrantStub,
  CharacterReceipt,
} from './character-model.ts';

export interface CharacterServiceOptions {
  store: Store;
  clock: Clock;
  initialProgressionRef: { id: string; version: number };
  initialWeaponTemplateRef: { id: string; version: number };
}

export function validateCharacterName(name: string): boolean {
  if (typeof name !== 'string') return false;
  return /^(?:[A-Za-z]{1,12}|\p{Unified_Ideograph}{1,6})$/u.test(name);
}

export async function characterKey(kind: string, parts: readonly (string | number)[]): Promise<string> {
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([kind, ...parts]))));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `v2:${kind}:${b64}`;
}

export class CharacterService {
  private readonly options: CharacterServiceOptions;

  constructor(options: CharacterServiceOptions) {
    this.options = { ...options };
  }

  async execute(value: unknown): Promise<CharacterResponse> {
    let command: CharacterCommand;
    try {
      command = parseCharacterCommand(value);
    } catch {
      return {
        protocolVersion: 2,
        command: 'character.create',
        operationId: typeof (value as any)?.operationId === 'string' ? (value as any).operationId : 'op-unknown',
        serverTime: time(this.options.clock.now()),
        replayed: false,
        outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
      };
    }

    const { operationId, sessionId, sessionEpoch } = command;
    const now = time(this.options.clock.now());

    if (command.command !== 'character.create') {
      return parseCharacterResponse({
        protocolVersion: 2,
        command: command.command,
        operationId,
        serverTime: now,
        replayed: false,
        outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
      });
    }

    const { classId, characterName } = command.payload;

    if (!validateCharacterName(characterName)) {
      return parseCharacterResponse({
        protocolVersion: 2,
        command: command.command,
        operationId,
        serverTime: now,
        replayed: false,
        outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
      });
    }

    if (classId !== 'warrior') {
      // Hunter is not currently enabled for creation in v1 release profile
      return parseCharacterResponse({
        protocolVersion: 2,
        command: command.command,
        operationId,
        serverTime: now,
        replayed: false,
        outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
      });
    }

    const normalizedName = characterName.toLowerCase();
    const nameKey = await characterKey('name', [normalizedName]);

    try {
      return await this.options.store.run(async tx => {
        const currentTime = time(this.options.clock.now());

        // 1. Session check
        const session = await tx.get<LoginSession>(sessionId);
        if (!session || session.status === 'revoked') {
          return parseCharacterResponse({
            protocolVersion: 2,
            command: command.command,
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'SESSION_REVOKED' },
          });
        }
        if (session.epoch !== sessionEpoch) {
          return parseCharacterResponse({
            protocolVersion: 2,
            command: command.command,
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'VERSION_CONFLICT' },
          });
        }

        const accountId = session.accountId;
        const receiptKey = await characterKey('receipt', [accountId, operationId]);
        const intentTuple = JSON.stringify([accountId, command.command, operationId, classId, characterName]);

        // 2. Receipt check for idempotency / lost response recovery
        const previousReceipt = await tx.get<CharacterReceipt>(receiptKey);
        if (previousReceipt) {
          if (previousReceipt.tuple !== intentTuple) {
            return parseCharacterResponse({
              protocolVersion: 2,
              command: command.command,
              operationId,
              serverTime: currentTime,
              replayed: false,
              outcome: { status: 'rejected', code: 'OPERATION_MISMATCH' },
            });
          }
          const restored = structuredClone(previousReceipt.result);
          return parseCharacterResponse({
            ...restored,
            replayed: true,
            serverTime: currentTime,
          });
        }

        // 3. Account check
        const account = await tx.get<LoginAccount>(accountId);
        if (!account) {
          return parseCharacterResponse({
            protocolVersion: 2,
            command: command.command,
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' },
          });
        }

        // Check expected versions
        for (const exp of command.expected) {
          if (exp.kind === 'account' && exp.id === account.id && exp.version !== account.version) {
            return parseCharacterResponse({
              protocolVersion: 2,
              command: command.command,
              operationId,
              serverTime: currentTime,
              replayed: false,
              outcome: { status: 'rejected', code: 'VERSION_CONFLICT' },
            });
          }
        }

        // 4. Class uniqueness check on account
        if (account.characterIdsByClass?.[classId]) {
          return parseCharacterResponse({
            protocolVersion: 2,
            command: command.command,
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'CLASS_EXISTS' },
          });
        }

        // 5. Global name occupancy check
        const existingName = await tx.get<CharacterNameOccupancy>(nameKey);
        if (existingName) {
          return parseCharacterResponse({
            protocolVersion: 2,
            command: command.command,
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
          });
        }

        // 6. Generate IDs for all entities
        const characterId = await characterKey('character', [accountId, classId]);
        const backpackId = await characterKey('container', [accountId, 'backpack', classId]);
        const personalVaultId = await characterKey('container', [accountId, 'vault', classId]);
        const weaponId = await characterKey('equipment', [accountId, classId, 'weapon']);
        const mailId = await characterKey('mail', [accountId, classId, 'novice-gift']);
        const grantId = await characterKey('grant', [accountId, classId, 'novice-gift']);

        // Check non-existence of candidate entities
        const [eChar, eBackpack, eVault, eWeapon, eMail, eGrant] = await Promise.all([
          tx.get(characterId),
          tx.get(backpackId),
          tx.get(personalVaultId),
          tx.get(weaponId),
          tx.get(mailId),
          tx.get(grantId),
        ]);
        if (eChar || eBackpack || eVault || eWeapon || eMail || eGrant) {
          throw new Error('CHARACTER_ENTITY_INTEGRITY_VIOLATION');
        }

        // 7. Construct entities
        // Write 1: Name occupancy
        const nameOccupancy: CharacterNameOccupancy = {
          schemaVersion: 2,
          id: nameKey,
          name: characterName,
          accountId,
          characterId,
          createdAt: currentTime,
        };
        tx.set(nameKey, nameOccupancy);

        // Write 2: Character entity
        const character: CharacterEntity = {
          schemaVersion: 2,
          id: characterId,
          characterId,
          accountId,
          classId: 'warrior',
          characterName,
          level: 1,
          xp: 0,
          version: 0,
          rolePlayEpoch: 1,
          statsVersion: 0,
          equipmentVersion: 0,
          equipped: { weapon: weaponId },
          backpackId,
          personalVaultId,
          stamina: { value: 308, refillWindow: 0 },
          quickSlots: [null, null, null],
          location: { kind: 'inn', characterId },
          progressionConfigRef: { ...this.options.initialProgressionRef },
          createdAt: currentTime,
          updatedAt: currentTime,
        };
        tx.set(characterId, character);

        // Write 3: Backpack (capacity 20)
        const backpack: ContainerEntity = {
          schemaVersion: 2,
          id: backpackId,
          accountId,
          characterId,
          kind: 'backpack',
          capacity: 20,
          stage: 0,
          slots: {},
          unlockConfigRef: { id: 'backpack-unlock-v1', version: 1 },
          version: 0,
          createdAt: currentTime,
          updatedAt: currentTime,
        };
        tx.set(backpackId, backpack);

        // Write 4: Personal Vault (capacity 20)
        const personalVault: ContainerEntity = {
          schemaVersion: 2,
          id: personalVaultId,
          accountId,
          characterId,
          kind: 'personalVault',
          capacity: 20,
          stage: 0,
          slots: {},
          unlockConfigRef: { id: 'personalVault-unlock-v1', version: 1 },
          version: 0,
          createdAt: currentTime,
          updatedAt: currentTime,
        };
        tx.set(personalVaultId, personalVault);

        // Write 5: Initial White Warrior Weapon
        const weapon: EquipmentEntity = {
          schemaVersion: 2,
          id: weaponId,
          accountId,
          holderCharacterId: characterId,
          sourceKey: 'initial-warrior-weapon',
          sourceOrdinal: 0,
          sourceLocator: { kind: 'initialEquip', characterId },
          templateRef: { ...this.options.initialWeaponTemplateRef },
          itemLevel: 10,
          quality: 'white',
          rolledAffixes: [],
          setRef: null,
          binding: { kind: 'character', accountId, characterId },
          enhancementLevel: 0,
          durability: {
            wearEnabled: true,
            current: 100,
            max: 100,
            policyRef: 'test-weapon-wear-v1',
          },
          location: { kind: 'equipped', characterId, slotId: 'weapon' },
          lifecycle: 'active',
          version: 0,
          createdAt: currentTime,
          updatedAt: currentTime,
        };
        tx.set(weaponId, weapon);

        // Write 6: Novice Mail
        const expiresAt = time(currentTime + 30 * 24 * 60 * 60 * 1000);
        const mail: MailEntity = {
          schemaVersion: 2,
          id: mailId,
          accountId,
          characterId,
          sourceKey: 'novice-gift',
          titleKey: 'mail.novice.title',
          bodyKey: 'mail.novice.body',
          parameters: {},
          expiresAt,
          status: 'active',
          attachments: [
            {
              attachmentId: 'att-hp-potion',
              kind: 'stack',
              templateRef: { id: 'item:hp-potion-small-v1', version: 1 },
              quantityGranted: 8,
              quantityClaimed: 0,
              binding: { kind: 'character', accountId, characterId },
              state: 'available',
            },
            {
              attachmentId: 'att-mp-potion',
              kind: 'stack',
              templateRef: { id: 'item:mp-potion-small-v1', version: 1 },
              quantityGranted: 8,
              quantityClaimed: 0,
              binding: { kind: 'character', accountId, characterId },
              state: 'available',
            },
            {
              attachmentId: 'att-revival-emblem',
              kind: 'stack',
              templateRef: { id: 'item:revival-emblem-v1', version: 1 },
              quantityGranted: 10,
              quantityClaimed: 0,
              binding: { kind: 'character', accountId, characterId },
              state: 'available',
            },
          ],
          createdAt: currentTime,
          updatedAt: currentTime,
        };
        tx.set(mailId, mail);

        // Write 7: Novice Grant Stub (prevents re-granting even if mail is deleted)
        const grantStub: NoviceGrantStub = {
          schemaVersion: 2,
          id: grantId,
          accountId,
          characterId,
          sourceType: 'novice-gift',
          sourceTuple: JSON.stringify(['novice-gift', characterId]),
          route: 'mail',
          deliveryState: 'delivered',
          relatedId: mailId,
          deliveredAt: currentTime,
        };
        tx.set(grantId, grantStub);

        // Write 8: Account character class pointer & writeRevision update
        const updatedAccount: LoginAccount = {
          ...account,
          characterIdsByClass: {
            ...account.characterIdsByClass,
            [classId]: characterId,
          },
          writeRevision: account.writeRevision + 1,
          updatedAt: currentTime,
        };
        tx.set(account.id, updatedAccount);

        // Write 9: Receipt
        const resultVersions: Expected[] = [
          { kind: 'account', id: account.id, version: updatedAccount.version },
          { kind: 'character', id: characterId, version: character.version },
          { kind: 'container', id: backpackId, version: backpack.version },
          { kind: 'container', id: personalVaultId, version: personalVault.version },
          { kind: 'equipment', id: weaponId, version: weapon.version },
          { kind: 'mail', id: mailId, version: 0 },
        ];

        const response: CharacterResponse = parseCharacterResponse({
          protocolVersion: 2,
          command: command.command,
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: {
            status: 'committed',
            data: {
              characterId,
              classId: 'warrior',
              characterName,
              initializationRef: 'init-warrior-v1',
            },
            resultVersions,
          },
        });

        const receipt: CharacterReceipt = {
          schemaVersion: 2,
          id: receiptKey,
          accountId,
          tuple: intentTuple,
          result: response,
          createdAt: currentTime,
        };
        tx.set(receiptKey, receipt);

        return response;
      });
    } catch (error) {
      if (error instanceof CommitUnknown) {
        return parseCharacterResponse({
          protocolVersion: 2,
          command: command.command,
          operationId,
          serverTime: time(this.options.clock.now()),
          replayed: false,
          outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' },
        });
      }
      if (error instanceof StoreUnavailable) {
        return parseCharacterResponse({
          protocolVersion: 2,
          command: command.command,
          operationId,
          serverTime: time(this.options.clock.now()),
          replayed: false,
          outcome: { status: 'rejected', code: 'SERVICE_UNAVAILABLE' },
        });
      }
      throw error;
    }
  }
}
