import { time } from '../../../shared/src/exact-values.ts';
import type { Store, Clock } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable } from '../ports/store.ts';
import type { LoginAccount, LoginSession } from '../identity/login-model.ts';
import type { CharacterEntity, ContainerEntity, MailEntity, RewardGrantEntity } from '../character/character-model.ts';
import { characterKey } from '../character/character-service.ts';
import type {
  TownMapManifest,
  TownMovementStep,
  ServiceContextEntity,
} from './town-model.ts';
import { DEFAULT_TOWN_MAP } from './town-model.ts';
import { parseAssetResponse, parseAssetQueryResponse } from '../../../shared/src/protocol/asset-v2.ts';
import type { AssetResponse, AssetQueryResponse } from '../../../shared/src/protocol/asset-v2.ts';

export interface TownServiceOptions {
  store: Store;
  clock: Clock;
  manifest?: TownMapManifest;
}

export interface TownMoveCommand {
  protocolVersion: 2;
  command: 'town.move';
  operationId: string;
  sessionId: string;
  sessionEpoch: number;
  payload: {
    characterId: string;
    steps: TownMovementStep[];
  };
}

export interface TownMoveResponse {
  protocolVersion: 2;
  command: 'town.move';
  operationId: string;
  serverTime: number;
  replayed: boolean;
  outcome:
    | {
        status: 'committed';
        data: {
          characterId: string;
          position: { x: number; y: number };
          acceptedSeq: number;
          locationRevision: number;
        };
      }
    | {
        status: 'rejected';
        code:
          | 'INVALID_ARGUMENT'
          | 'OUT_OF_BOUNDS'
          | 'SPEED_LIMIT_EXCEEDED'
          | 'ORDER_VIOLATION'
          | 'NOT_IN_TOWN'
          | 'SESSION_REVOKED'
          | 'VERSION_CONFLICT'
          | 'NOT_FOUND_OR_FORBIDDEN';
      };
}

export class TownService {
  private readonly options: Required<TownServiceOptions>;

  constructor(options: TownServiceOptions) {
    this.options = {
      store: options.store,
      clock: options.clock,
      manifest: options.manifest ?? DEFAULT_TOWN_MAP,
    };
  }

  get manifest(): TownMapManifest {
    return this.options.manifest;
  }

  // -------------------------------------------------------------
  // Ticket 02: scene.exitInn
  // -------------------------------------------------------------
  async exitInn(request: {
    protocolVersion: 2;
    command: 'scene.exitInn';
    operationId: string;
    sessionId: string;
    sessionEpoch: number;
    expected: any[];
    payload: { characterId: string; exitAnchorId: string };
  }): Promise<AssetResponse<'scene.exitInn'>> {
    const { operationId, sessionId, sessionEpoch, payload } = request;
    const { characterId, exitAnchorId } = payload;
    const manifest = this.options.manifest;

    return await this.options.store.run(async tx => {
      const currentTime = time(this.options.clock.now());

      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return parseAssetResponse('scene.exitInn', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'SESSION_REVOKED' },
        });
      }
      if (session.epoch !== sessionEpoch) {
        return parseAssetResponse('scene.exitInn', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'VERSION_CONFLICT' },
        });
      }

      const account = await tx.get<LoginAccount>(session.accountId);
      if (!account) {
        return parseAssetResponse('scene.exitInn', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      const character = await tx.get<CharacterEntity>(characterId);
      if (!character || character.accountId !== account.id) {
        return parseAssetResponse('scene.exitInn', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      if (character.location.kind !== 'inn') {
        return parseAssetResponse('scene.exitInn', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'LOCATION_NOT_ALLOWED' },
        });
      }

      if (exitAnchorId !== manifest.innDoorAnchor.anchorId) {
        return parseAssetResponse('scene.exitInn', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
        });
      }

      const nextRevision = (character.townState?.locationRevision || 0) + 1;
      const updatedCharacter: CharacterEntity = {
        ...character,
        location: { kind: 'town', mapId: manifest.mapId, anchorId: manifest.innDoorAnchor.anchorId },
        townState: {
          mapRef: manifest.mapId,
          sceneEpoch: 1,
          position: { x: manifest.innDoorAnchor.x, y: manifest.innDoorAnchor.y },
          velocityRemainder: 0,
          acceptedSeq: 0,
          locationRevision: nextRevision,
          updatedAt: currentTime,
        },
        version: character.version + 1,
        updatedAt: currentTime,
      };

      tx.set(updatedCharacter.id, updatedCharacter);

      return parseAssetResponse('scene.exitInn', {
        operationId,
        serverTime: currentTime,
        replayed: false,
        outcome: {
          status: 'committed',
          data: {
            characterId: updatedCharacter.id,
            anchorId: manifest.innDoorAnchor.anchorId,
            locationRevision: nextRevision,
          },
          resultVersions: [
            { kind: 'character', id: updatedCharacter.id, version: updatedCharacter.version },
          ],
        },
      });
    });
  }

  // -------------------------------------------------------------
  // Ticket 02: town.move
  // -------------------------------------------------------------
  async move(command: TownMoveCommand): Promise<TownMoveResponse> {
    const { operationId, sessionId, sessionEpoch, payload } = command;
    const { characterId, steps } = payload;
    const manifest = this.options.manifest;

    if (!Array.isArray(steps) || steps.length === 0 || steps.length > 32) {
      return {
        protocolVersion: 2,
        command: 'town.move',
        operationId,
        serverTime: time(this.options.clock.now()),
        replayed: false,
        outcome: { status: 'rejected', code: 'INVALID_ARGUMENT' },
      };
    }

    const totalDuration = steps.reduce((sum, s) => sum + (s.dtMs || 0), 0);
    if (totalDuration > 1000) {
      return {
        protocolVersion: 2,
        command: 'town.move',
        operationId,
        serverTime: time(this.options.clock.now()),
        replayed: false,
        outcome: { status: 'rejected', code: 'SPEED_LIMIT_EXCEEDED' },
      };
    }

    return await this.options.store.run(async tx => {
      const currentTime = time(this.options.clock.now());

      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return {
          protocolVersion: 2,
          command: 'town.move',
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'SESSION_REVOKED' },
        };
      }
      if (session.epoch !== sessionEpoch) {
        return {
          protocolVersion: 2,
          command: 'town.move',
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'VERSION_CONFLICT' },
        };
      }

      const account = await tx.get<LoginAccount>(session.accountId);
      if (!account) {
        return {
          protocolVersion: 2,
          command: 'town.move',
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' },
        };
      }

      const character = await tx.get<CharacterEntity>(characterId);
      if (!character || character.accountId !== account.id) {
        return {
          protocolVersion: 2,
          command: 'town.move',
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' },
        };
      }

      if (character.location.kind !== 'town' || !character.townState) {
        return {
          protocolVersion: 2,
          command: 'town.move',
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'NOT_IN_TOWN' },
        };
      }

      let currSeq = character.townState.acceptedSeq;
      let currX = character.townState.position.x;
      let currY = character.townState.position.y;

      for (const step of steps) {
        if (typeof step.seq !== 'number' || step.seq !== currSeq + 1) {
          return {
            protocolVersion: 2,
            command: 'town.move',
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'ORDER_VIOLATION' },
          };
        }

        const dtSec = step.dtMs / 1000;
        const maxStepDistance = manifest.speedLimit * dtSec + 1; // 1px rounding margin
        const stepDist = Math.hypot(step.dx, step.dy);
        if (stepDist > maxStepDistance) {
          return {
            protocolVersion: 2,
            command: 'town.move',
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'SPEED_LIMIT_EXCEEDED' },
          };
        }

        const nextX = currX + step.dx;
        const nextY = currY + step.dy;

        if (
          nextX < manifest.bounds.minX ||
          nextX > manifest.bounds.maxX ||
          nextY < manifest.bounds.minY ||
          nextY > manifest.bounds.maxY
        ) {
          return {
            protocolVersion: 2,
            command: 'town.move',
            operationId,
            serverTime: currentTime,
            replayed: false,
            outcome: { status: 'rejected', code: 'OUT_OF_BOUNDS' },
          };
        }

        currX = nextX;
        currY = nextY;
        currSeq = step.seq;
      }

      const roundedX = Math.round(currX);
      const roundedY = Math.round(currY);
      const nextRevision = character.townState.locationRevision + 1;

      const updatedTownState = {
        ...character.townState,
        position: { x: roundedX, y: roundedY },
        acceptedSeq: currSeq,
        locationRevision: nextRevision,
        updatedAt: currentTime,
      };

      const updatedCharacter: CharacterEntity = {
        ...character,
        townState: updatedTownState,
        version: character.version + 1,
        updatedAt: currentTime,
      };

      tx.set(updatedCharacter.id, updatedCharacter);

      return {
        protocolVersion: 2,
        command: 'town.move',
        operationId,
        serverTime: currentTime,
        replayed: false,
        outcome: {
          status: 'committed',
          data: {
            characterId: updatedCharacter.id,
            position: updatedTownState.position,
            acceptedSeq: updatedTownState.acceptedSeq,
            locationRevision: updatedTownState.locationRevision,
          },
        },
      };
    });
  }

  // -------------------------------------------------------------
  // Ticket 03: service.open
  // -------------------------------------------------------------
  async openService(request: {
    protocolVersion: 2;
    command: 'service.open';
    operationId: string;
    sessionId: string;
    sessionEpoch: number;
    expected: any[];
    payload: {
      characterId: string;
      serviceKind: 'bank' | 'mailbox' | 'shop' | 'repair' | 'enhance' | 'pointsShop';
      anchorId: string;
    };
  }): Promise<AssetResponse<'service.open'>> {
    const { operationId, sessionId, sessionEpoch, payload } = request;
    const { characterId, serviceKind, anchorId } = payload;
    const manifest = this.options.manifest;

    return await this.options.store.run(async tx => {
      const currentTime = time(this.options.clock.now());

      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return parseAssetResponse('service.open', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'SESSION_REVOKED' },
        });
      }
      if (session.epoch !== sessionEpoch) {
        return parseAssetResponse('service.open', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'VERSION_CONFLICT' },
        });
      }

      const account = await tx.get<LoginAccount>(session.accountId);
      if (!account) {
        return parseAssetResponse('service.open', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      const character = await tx.get<CharacterEntity>(characterId);
      if (!character || character.accountId !== account.id) {
        return parseAssetResponse('service.open', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      if (character.location.kind !== 'town' || !character.townState) {
        return parseAssetResponse('service.open', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'LOCATION_NOT_ALLOWED' },
        });
      }

      const anchor = manifest.serviceAnchors[anchorId];
      if (!anchor || anchor.serviceKind !== serviceKind) {
        return parseAssetResponse('service.open', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'CONFIG_NOT_READY' },
        });
      }

      const distSq =
        (character.townState.position.x - anchor.x) ** 2 +
        (character.townState.position.y - anchor.y) ** 2;

      if (distSq > 576) {
        // 24^2 = 576
        return parseAssetResponse('service.open', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'LOCATION_NOT_ALLOWED' },
        });
      }

      const contextId = await characterKey('ctx', [
        account.id,
        character.id,
        serviceKind,
        character.townState.locationRevision,
      ]);

      const context: ServiceContextEntity = {
        schemaVersion: 2,
        id: contextId,
        accountId: account.id,
        characterId: character.id,
        rolePlayEpoch: character.rolePlayEpoch,
        sceneEpoch: character.townState.sceneEpoch,
        locationRevision: character.townState.locationRevision,
        anchorId,
        serviceKind,
        issuedAt: currentTime,
        status: 'open',
      };

      tx.set(contextId, context);

      return parseAssetResponse('service.open', {
        operationId,
        serverTime: currentTime,
        replayed: false,
        outcome: {
          status: 'committed',
          data: {
            contextId,
            serviceKind,
            locationRevision: character.townState.locationRevision,
          },
          resultVersions: [
            { kind: 'character', id: character.id, version: character.version },
          ],
        },
      });
    });
  }

  // -------------------------------------------------------------
  // Ticket 03: service.close
  // -------------------------------------------------------------
  async closeService(request: {
    protocolVersion: 2;
    command: 'service.close';
    operationId: string;
    sessionId: string;
    sessionEpoch: number;
    expected: any[];
    payload: { characterId: string; contextId: string };
  }): Promise<AssetResponse<'service.close'>> {
    const { operationId, sessionId, sessionEpoch, payload } = request;
    const { characterId, contextId } = payload;

    return await this.options.store.run(async tx => {
      const currentTime = time(this.options.clock.now());

      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return parseAssetResponse('service.close', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'SESSION_REVOKED' },
        });
      }

      const context = await tx.get<ServiceContextEntity>(contextId);
      if (!context || context.characterId !== characterId) {
        return parseAssetResponse('service.close', {
          operationId,
          serverTime: currentTime,
          replayed: false,
          outcome: { status: 'rejected', code: 'CONTEXT_INVALID' },
        });
      }

      const updatedContext: ServiceContextEntity = {
        ...context,
        status: 'closed',
      };
      tx.set(contextId, updatedContext);

      return parseAssetResponse('service.close', {
        operationId,
        serverTime: currentTime,
        replayed: false,
        outcome: {
          status: 'committed',
          data: { contextId, closed: true },
          resultVersions: [],
        },
      });
    });
  }

  // -------------------------------------------------------------
  // Ticket 03: service.get
  // -------------------------------------------------------------
  async getService(query: {
    protocolVersion: 2;
    query: 'service.get';
    requestId: string;
    sessionId: string;
    sessionEpoch: number;
    payload: { characterId: string; serviceContextId: string };
  }): Promise<AssetQueryResponse<'service.get'>> {
    const { requestId, payload } = query;
    const { characterId, serviceContextId } = payload;
    const currentTime = time(this.options.clock.now());

    return await this.options.store.run(async tx => {
      const context = await tx.get<ServiceContextEntity>(serviceContextId);
      if (!context || context.characterId !== characterId) {
        return parseAssetQueryResponse('service.get', {
          requestId,
          serverTime: currentTime,
          error: { code: 'CONTEXT_INVALID' },
        });
      }

      return parseAssetQueryResponse('service.get', {
        requestId,
        serverTime: currentTime,
        versions: [],
        data: {
          contextId: context.id,
          serviceKind: context.serviceKind,
          state: context.status === 'open' ? 'open' : context.status === 'closed' ? 'closed' : 'invalid',
          locationRevision: context.locationRevision,
          allowedCommands: ['service.close'],
        },
      });
    });
  }

  // -------------------------------------------------------------
  // Ticket 04: inventory.get (personalVault requires bank context)
  // -------------------------------------------------------------
  async getInventory(query: {
    protocolVersion: 2;
    query: 'inventory.get';
    requestId: string;
    sessionId: string;
    sessionEpoch: number;
    payload: {
      characterId: string;
      containerKind: 'backpack' | 'personalVault' | 'accountVault';
      contextId?: string;
    };
  }): Promise<AssetQueryResponse<'inventory.get'>> {
    const { requestId, sessionId, sessionEpoch, payload } = query;
    const { characterId, containerKind, contextId } = payload;
    const manifest = this.options.manifest;
    const currentTime = time(this.options.clock.now());

    return await this.options.store.run(async tx => {
      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return parseAssetQueryResponse('inventory.get', {
          requestId,
          serverTime: currentTime,
          error: { code: 'SESSION_REVOKED' },
        });
      }
      if (session.epoch !== sessionEpoch) {
        return parseAssetQueryResponse('inventory.get', {
          requestId,
          serverTime: currentTime,
          error: { code: 'VERSION_CONFLICT' },
        });
      }

      const character = await tx.get<CharacterEntity>(characterId);
      if (!character || character.accountId !== session.accountId) {
        return parseAssetQueryResponse('inventory.get', {
          requestId,
          serverTime: currentTime,
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      if (containerKind === 'personalVault') {
        if (!contextId) {
          return parseAssetQueryResponse('inventory.get', {
            requestId,
            serverTime: currentTime,
            error: { code: 'CONTEXT_INVALID' },
          });
        }

        const context = await tx.get<ServiceContextEntity>(contextId);
        if (
          !context ||
          context.status !== 'open' ||
          context.serviceKind !== 'bank' ||
          context.characterId !== character.id ||
          context.rolePlayEpoch !== character.rolePlayEpoch ||
          (character.townState && context.locationRevision !== character.townState.locationRevision)
        ) {
          return parseAssetQueryResponse('inventory.get', {
            requestId,
            serverTime: currentTime,
            error: { code: 'CONTEXT_INVALID' },
          });
        }

        // Verify character is still within bank range
        if (character.townState) {
          const bankAnchor = manifest.serviceAnchors[context.anchorId];
          if (bankAnchor) {
            const distSq =
              (character.townState.position.x - bankAnchor.x) ** 2 +
              (character.townState.position.y - bankAnchor.y) ** 2;
            if (distSq > 576) {
              return parseAssetQueryResponse('inventory.get', {
                requestId,
                serverTime: currentTime,
                error: { code: 'LOCATION_NOT_ALLOWED' },
              });
            }
          }
        }

        const vault = await tx.get<ContainerEntity>(character.personalVaultId);
        if (!vault) {
          return parseAssetQueryResponse('inventory.get', {
            requestId,
            serverTime: currentTime,
            error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
          });
        }

        const slots = Object.entries(vault.slots).map(([idx, entry]) => ({
          index: Number(idx),
          entry,
        }));

        return parseAssetQueryResponse('inventory.get', {
          requestId,
          serverTime: currentTime,
          versions: [{ kind: 'container', id: vault.id, version: vault.version }],
          data: {
            containerId: vault.id,
            version: vault.version,
            kind: 'personalVault',
            owner: { kind: 'character', characterId: character.id },
            capacity: vault.capacity,
            unlockStage: vault.stage,
            slots,
          },
        });
      }

      // Backpack
      const backpack = await tx.get<ContainerEntity>(character.backpackId);
      if (!backpack) {
        return parseAssetQueryResponse('inventory.get', {
          requestId,
          serverTime: currentTime,
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      const slots = Object.entries(backpack.slots).map(([idx, entry]) => ({
        index: Number(idx),
        entry,
      }));

      return parseAssetQueryResponse('inventory.get', {
        requestId,
        serverTime: currentTime,
        versions: [{ kind: 'container', id: backpack.id, version: backpack.version }],
        data: {
          containerId: backpack.id,
          version: backpack.version,
          kind: 'backpack',
          owner: { kind: 'character', characterId: character.id },
          capacity: backpack.capacity,
          unlockStage: backpack.stage,
          slots,
        },
      });
    });
  }

  // -------------------------------------------------------------
  // Ticket 04: mail.list (requires mailbox context)
  // -------------------------------------------------------------
  async getMailList(query: {
    protocolVersion: 2;
    query: 'mail.list';
    requestId: string;
    sessionId: string;
    sessionEpoch: number;
    payload: {
      characterId: string;
      contextId: string;
      cursor: string | null;
      pageRequest: number;
    };
  }): Promise<AssetQueryResponse<'mail.list'>> {
    const { requestId, sessionId, sessionEpoch, payload } = query;
    const { characterId, contextId } = payload;
    const manifest = this.options.manifest;
    const currentTime = time(this.options.clock.now());

    return await this.options.store.run(async tx => {
      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return parseAssetQueryResponse('mail.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'SESSION_REVOKED' },
        });
      }
      if (session.epoch !== sessionEpoch) {
        return parseAssetQueryResponse('mail.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'VERSION_CONFLICT' },
        });
      }

      const character = await tx.get<CharacterEntity>(characterId);
      if (!character || character.accountId !== session.accountId) {
        return parseAssetQueryResponse('mail.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      const context = await tx.get<ServiceContextEntity>(contextId);
      if (
        !context ||
        context.status !== 'open' ||
        context.serviceKind !== 'mailbox' ||
        context.characterId !== character.id ||
        context.rolePlayEpoch !== character.rolePlayEpoch ||
        (character.townState && context.locationRevision !== character.townState.locationRevision)
      ) {
        return parseAssetQueryResponse('mail.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'CONTEXT_INVALID' },
        });
      }

      if (character.townState) {
        const mailboxAnchor = manifest.serviceAnchors[context.anchorId];
        if (mailboxAnchor) {
          const distSq =
            (character.townState.position.x - mailboxAnchor.x) ** 2 +
            (character.townState.position.y - mailboxAnchor.y) ** 2;
          if (distSq > 576) {
            return parseAssetQueryResponse('mail.list', {
              requestId,
              serverTime: currentTime,
              error: { code: 'LOCATION_NOT_ALLOWED' },
            });
          }
        }
      }

      const mailIds = new Set<string>(character.mailIds ?? []);
      const noviceMailId = await characterKey('mail', [character.accountId, character.classId, 'novice-gift']);
      mailIds.add(noviceMailId);

      const mails: MailEntity[] = [];
      for (const mailId of mailIds) {
        const mail = await tx.get<MailEntity>(mailId);
        if (mail && mail.schemaVersion === 2 && mail.characterId === character.id && mail.status !== 'deleted') {
          mails.push(mail);
        }
      }
      mails.sort((a, b) => b.createdAt - a.createdAt);

      const entries = mails.map(mail => ({
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
        serverTime: currentTime,
        versions: [],
        data: {
          entries,
          nextCursor: null,
        },
      });
    });
  }

  async getRewardList(query: {
    protocolVersion: 2;
    query: 'reward.list';
    requestId: string;
    sessionId: string;
    sessionEpoch: number;
    payload: { characterId: string; contextId: string; cursor: string | null; pageRequest: number };
  }): Promise<AssetQueryResponse<'reward.list'>> {
    const { requestId, sessionId, sessionEpoch, payload } = query;
    const { characterId, contextId } = payload;
    const currentTime = time(this.options.clock.now());

    return await this.options.store.run(async tx => {
      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return parseAssetQueryResponse('reward.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'SESSION_REVOKED' },
        });
      }
      if (session.epoch !== sessionEpoch) {
        return parseAssetQueryResponse('reward.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'VERSION_CONFLICT' },
        });
      }

      const character = await tx.get<CharacterEntity>(characterId);
      if (!character || character.accountId !== session.accountId) {
        return parseAssetQueryResponse('reward.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      const context = await tx.get<ServiceContextEntity>(contextId);
      if (
        !context ||
        context.status !== 'open' ||
        context.serviceKind !== 'mailbox' ||
        context.characterId !== character.id ||
        context.rolePlayEpoch !== character.rolePlayEpoch ||
        (character.townState && context.locationRevision !== character.townState.locationRevision)
      ) {
        return parseAssetQueryResponse('reward.list', {
          requestId,
          serverTime: currentTime,
          error: { code: 'CONTEXT_INVALID' },
        });
      }

      const grants: RewardGrantEntity[] = [];
      for (const grantId of character.pendingGrantIds ?? []) {
        const grant = await tx.get<RewardGrantEntity>(grantId);
        if (grant && grant.schemaVersion === 2 && grant.characterId === character.id) {
          grants.push(grant);
        }
      }
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
        serverTime: currentTime,
        versions: [],
        data: {
          entries,
          nextCursor: null,
        },
      });
    });
  }

  // -------------------------------------------------------------
  // Ticket 04: delivery.summary (HUD summary, no service context)
  // -------------------------------------------------------------
  async getDeliverySummary(query: {
    protocolVersion: 2;
    query: 'delivery.summary';
    requestId: string;
    sessionId: string;
    sessionEpoch: number;
    payload: { characterId: string };
  }): Promise<AssetQueryResponse<'delivery.summary'>> {
    const { requestId, sessionId, sessionEpoch, payload } = query;
    const { characterId } = payload;
    const currentTime = time(this.options.clock.now());

    return await this.options.store.run(async tx => {
      const session = await tx.get<LoginSession>(sessionId);
      if (!session || session.status === 'revoked') {
        return parseAssetQueryResponse('delivery.summary', {
          requestId,
          serverTime: currentTime,
          error: { code: 'SESSION_REVOKED' },
        });
      }
      if (session.epoch !== sessionEpoch) {
        return parseAssetQueryResponse('delivery.summary', {
          requestId,
          serverTime: currentTime,
          error: { code: 'VERSION_CONFLICT' },
        });
      }

      const character = await tx.get<CharacterEntity>(characterId);
      if (!character || character.accountId !== session.accountId) {
        return parseAssetQueryResponse('delivery.summary', {
          requestId,
          serverTime: currentTime,
          error: { code: 'NOT_FOUND_OR_FORBIDDEN' },
        });
      }

      const mailIds = new Set<string>(character.mailIds ?? []);
      const noviceMailId = await characterKey('mail', [character.accountId, character.classId, 'novice-gift']);
      mailIds.add(noviceMailId);

      let unreadMailCount = 0;
      for (const mailId of mailIds) {
        const mail = await tx.get<MailEntity>(mailId);
        if (mail && mail.schemaVersion === 2 && mail.characterId === character.id && mail.status !== 'deleted') {
          if (currentTime < mail.expiresAt) {
            const isUnread = mail.readAt == null;
            const hasUnclaimed = mail.attachments.some(a => a.quantityClaimed < a.quantityGranted);
            if (isUnread || hasUnclaimed) {
              unreadMailCount++;
            }
          }
        }
      }

      let pendingCount = 0;
      for (const grantId of character.pendingGrantIds ?? []) {
        const grant = await tx.get<RewardGrantEntity>(grantId);
        if (grant && grant.characterId === character.id && grant.deliveryState === 'available') {
          pendingCount++;
        }
      }

      return parseAssetQueryResponse('delivery.summary', {
        requestId,
        serverTime: currentTime,
        versions: [],
        data: {
          unreadMailCount,
          pendingCount,
          asOf: currentTime,
        },
      });
    });
  }
}
