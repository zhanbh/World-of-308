import { decodeAssetResponse, encodeAssetRequest, parseAssetCommand } from '../../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetQuery, AssetQueryResponse, AssetResponse } from '../../../../shared/src/protocol/asset-v2.ts';

export interface ShopTransport {
  send(jsonText: string): Promise<string>;
}

export interface ShopPendingStore {
  load(key: string): string | null;
  save(key: string, value: string | null): void;
}

export type ShopIdentity = {
  sessionId: string;
  sessionEpoch: number;
  characterId: string;
};

type ShopMutation = Extract<AssetCommand, { command: 'shop.buy' | 'shop.sell' | 'wallet.exchange' }>;

export type ShopCoordinatorState = {
  status: 'closed' | 'loading' | 'ready' | 'submitting' | 'unknown' | 'failed';
  contextId: string | null;
  serviceKind: 'shop' | 'pointsShop' | null;
  quoteRef: string | null;
  wallet: { gold: string; points: string };
  characterVersion: number;
  backpackVersion: number;
  walletVersion: number;
  code: string | null;
  pendingOperationId: string | null;
};

export class ShopCoordinator {
  private identity: ShopIdentity | null = null;
  private pending: ShopMutation | null = null;
  private generation = 0;
  private sequence = 0;
  private minimumCharacterVersion = 0;
  private minimumBagVersion = 0;
  private minimumWalletVersion = 0;
  private current: ShopCoordinatorState = this.initial();
  private readonly transport: ShopTransport;
  private readonly persistence: ShopPendingStore;

  constructor(transport: ShopTransport, persistence: ShopPendingStore) {
    this.transport = transport;
    this.persistence = persistence;
  }

  get state(): ShopCoordinatorState {
    return structuredClone(this.current);
  }

  private initial(): ShopCoordinatorState {
    return {
      status: 'closed',
      contextId: null,
      serviceKind: null,
      quoteRef: null,
      wallet: { gold: '0', points: '0' },
      characterVersion: 0,
      backpackVersion: 0,
      walletVersion: 0,
      code: null,
      pendingOperationId: null,
    };
  }

  private key(): string {
    const i = this.identity!;
    return JSON.stringify(['shop', i.sessionId, i.sessionEpoch, i.characterId]);
  }

  init(identity: ShopIdentity): void {
    ++this.generation;
    this.minimumCharacterVersion = 0;
    this.minimumBagVersion = 0;
    this.minimumWalletVersion = 0;
    this.identity = { ...identity };
    this.current = this.initial();
    this.pending = null;

    const saved = this.persistence.load(this.key());
    if (saved !== null) {
      const command = parseAssetCommand(JSON.parse(saved));
      if (
        !['shop.buy', 'shop.sell', 'wallet.exchange'].includes(command.command) ||
        command.sessionId !== identity.sessionId ||
        command.sessionEpoch !== identity.sessionEpoch ||
        !('characterId' in command.payload) ||
        command.payload.characterId !== identity.characterId
      ) {
        throw new Error('INVALID_PENDING_SHOP_COMMAND');
      }
      this.pending = command as ShopMutation;
      this.current.pendingOperationId = command.operationId;
    }
  }

  close(): void {
    ++this.generation;
    this.current.status = 'closed';
  }

  reset(): void {
    ++this.generation;
    this.current = this.initial();
    this.pending = null;
    if (this.identity) {
      this.persistence.save(this.key(), null);
    }
  }

  async open(
    contextId: string,
    serviceKind: 'shop' | 'pointsShop',
    quoteRef: string,
  ): Promise<void> {
    if (!this.identity) throw new Error('IDENTITY_REQUIRED');
    const generation = ++this.generation;
    this.current.status = 'loading';
    this.current.contextId = contextId;
    this.current.serviceKind = serviceKind;
    this.current.quoteRef = quoteRef;
    this.current.code = null;

    await this.refresh(generation);
    if (generation === this.generation) {
      this.current.status = 'ready';
    }
  }

  private requireReady(): ShopIdentity {
    if (!this.identity || !['ready'].includes(this.current.status) || this.pending) {
      throw new Error('SHOP_NOT_READY');
    }
    return this.identity;
  }

  async buy(offerId: string, quantity: number, quoteRef: string): Promise<void> {
    const identity = this.requireReady();
    if (!this.current.contextId) throw new Error('CONTEXT_REQUIRED');
    const command: ShopMutation = {
      protocolVersion: 2,
      command: 'shop.buy',
      operationId: `shop-buy-${++this.sequence}`,
      sessionId: identity.sessionId,
      sessionEpoch: identity.sessionEpoch,
      expected: [
        { kind: 'character', id: identity.characterId, version: this.current.characterVersion },
      ],
      payload: {
        characterId: identity.characterId,
        contextId: this.current.contextId,
        offerId,
        quantity,
        quoteRef,
      },
    };
    await this.submit(command);
  }

  async sell(
    target: { kind: 'equipment'; itemId: string } | { kind: 'stack'; stackId: string },
    quantity: number,
    quoteRef: string,
  ): Promise<void> {
    const identity = this.requireReady();
    if (!this.current.contextId) throw new Error('CONTEXT_REQUIRED');
    const command: ShopMutation = {
      protocolVersion: 2,
      command: 'shop.sell',
      operationId: `shop-sell-${++this.sequence}`,
      sessionId: identity.sessionId,
      sessionEpoch: identity.sessionEpoch,
      expected: [
        { kind: 'character', id: identity.characterId, version: this.current.characterVersion },
      ],
      payload: {
        characterId: identity.characterId,
        contextId: this.current.contextId,
        target,
        quantity,
        quoteRef,
      },
    };
    await this.submit(command);
  }

  async exchange(
    fromCurrency: 'gold' | 'points',
    exchangeUnits: number,
    quoteRef: string,
  ): Promise<void> {
    const identity = this.requireReady();
    const command: ShopMutation = {
      protocolVersion: 2,
      command: 'wallet.exchange',
      operationId: `wallet-exchange-${++this.sequence}`,
      sessionId: identity.sessionId,
      sessionEpoch: identity.sessionEpoch,
      expected: [],
      payload: {
        characterId: identity.characterId,
        fromCurrency,
        exchangeUnits,
        quoteRef,
        contextId: this.current.contextId ?? undefined,
      },
    };
    await this.submit(command);
  }

  private async submit(command: ShopMutation): Promise<void> {
    const text = encodeAssetRequest(command);
    this.persistence.save(this.key(), text);
    this.pending = structuredClone(command);
    this.current.pendingOperationId = command.operationId;
    await this.sendPending(command, text);
  }

  async retryOriginal(): Promise<void> {
    if (!this.identity || !this.pending || this.current.status !== 'unknown') {
      throw new Error('NO_PENDING_SHOP_COMMAND');
    }
    await this.sendPending(this.pending, encodeAssetRequest(this.pending));
  }

  private async sendPending(command: ShopMutation, text: string): Promise<void> {
    const generation = this.generation;
    this.current.status = 'submitting';
    this.current.code = null;
    try {
      const response = decodeAssetResponse(command, await this.transport.send(text)) as AssetResponse;
      if (generation === this.generation) await this.accept(response, generation);
    } catch {
      if (generation === this.generation) this.unknown();
    }
  }

  async recover(): Promise<void> {
    if (!this.identity || !this.pending || this.current.status !== 'unknown') {
      throw new Error('NO_PENDING_SHOP_COMMAND');
    }
    const generation = this.generation;
    const pending = this.pending;
    this.current.status = 'submitting';
    this.current.code = null;
    try {
      const result = await this.query('operation.get', { operationId: pending.operationId });
      if (generation !== this.generation || this.pending !== pending) return;
      if ('error' in result || result.data.status === 'notFound') {
        this.unknown();
        return;
      }
      if (result.data.command !== pending.command) throw new Error('COMMAND_MISMATCH');
      await this.accept(result.data.result as AssetResponse, generation);
    } catch {
      if (generation === this.generation && this.pending === pending) this.unknown();
    }
  }

  private unknown(): void {
    this.current.status = 'unknown';
    this.current.code = 'RESULT_UNKNOWN';
  }

  private async accept(response: AssetResponse, generation: number): Promise<void> {
    if (response.outcome.status === 'unknown') {
      this.unknown();
      return;
    }
    this.persistence.save(this.key(), null);
    this.pending = null;
    this.current.pendingOperationId = null;

    if (response.outcome.status === 'rejected') {
      this.current.status = 'failed';
      this.current.code = response.outcome.code;
      return;
    }

    for (const v of response.outcome.resultVersions) {
      if (v.kind === 'character' && v.id === this.identity!.characterId) {
        this.minimumCharacterVersion = Math.max(this.minimumCharacterVersion, v.version);
      }
      if (v.kind === 'container') {
        this.minimumBagVersion = Math.max(this.minimumBagVersion, v.version);
      }
      if (v.kind === 'wallet') {
        this.minimumWalletVersion = Math.max(this.minimumWalletVersion, v.version);
      }
    }

    await this.refresh(generation);
    if (generation === this.generation) {
      this.current.status = 'ready';
    }
  }

  private async query<K extends AssetQuery['query']>(
    query: K,
    payload: Extract<AssetQuery, { query: K }>['payload'],
  ): Promise<AssetQueryResponse<K>> {
    const i = this.identity!;
    const request = {
      protocolVersion: 2,
      query,
      requestId: `shop-view-${++this.sequence}`,
      sessionId: i.sessionId,
      sessionEpoch: i.sessionEpoch,
      payload,
    } as AssetQuery;
    return decodeAssetResponse(
      request,
      await this.transport.send(encodeAssetRequest(request)),
    ) as AssetQueryResponse<K>;
  }

  private async refresh(generation: number): Promise<void> {
    const characterId = this.identity!.characterId;
    try {
      const [charResult, accountResult] = await Promise.all([
        this.query('character.get', { characterId }),
        this.query('account.get', {}),
      ]);
      if (generation !== this.generation) return;
      if ('error' in charResult) throw new Error(charResult.error.code);
      if ('error' in accountResult) throw new Error(accountResult.error.code);

      const charData = charResult.data;
      const accountData = accountResult.data;

      const charVer = charResult.versions.find(v => v.kind === 'character')?.version ?? 0;
      const accountVer = accountResult.versions.find(v => v.kind === 'account')?.version ?? 0;

      this.current.characterVersion = charVer;
      this.current.walletVersion = accountVer;
      this.current.wallet = {
        gold: accountData.wallet.gold,
        points: accountData.wallet.points,
      };
    } catch {
      // Background refresh failure will leave existing state
    }
  }
}
