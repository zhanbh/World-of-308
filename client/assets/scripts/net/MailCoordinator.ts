import { decodeAssetResponse, encodeAssetRequest, parseAssetCommand } from '../../../../shared/src/protocol/asset-v2.ts';
import type { AssetCommand, AssetQuery, AssetQueryResponse, AssetResponse } from '../../../../shared/src/protocol/asset-v2.ts';

export interface MailTransport {
  send(jsonText: string): Promise<string>;
}

export interface MailPendingStore {
  load(key: string): string | null;
  save(key: string, value: string | null): void;
}

export type MailIdentity = {
  sessionId: string;
  sessionEpoch: number;
  characterId: string;
};

export type MailItemAttachment = {
  attachmentId: string;
  kind: 'equipment' | 'stack';
  templateRef: string;
  quantityGranted: number;
  quantityClaimed: number;
  binding: { kind: 'none' | 'account' | 'character'; characterId?: string };
};

export type MailItem = {
  mailId: string;
  characterId: string;
  createdAt: number;
  expiresAt: number;
  read: boolean;
  attachments: MailItemAttachment[];
};

export type RewardItem = {
  grantId: string;
  itemId: string;
  characterId: string;
  createdAt: number;
  state: 'pending' | 'delivered';
};

export type DeliverySummary = {
  unreadMailCount: number;
  pendingCount: number;
  asOf: number;
};

type MailMutation = Extract<AssetCommand, { command: 'mail.markRead' | 'mail.delete' | 'mail.claimAttachment' | 'reward.claim' | 'mail.claimAvailable' }>;

export type MailCoordinatorState = {
  status: 'closed' | 'loading' | 'ready' | 'submitting' | 'unknown' | 'failed';
  contextId: string | null;
  mails: MailItem[];
  rewards: RewardItem[];
  summary: DeliverySummary;
  characterVersion: number;
  code: string | null;
  pendingOperationId: string | null;
};

export class MailCoordinator {
  private identity: MailIdentity | null = null;
  private pending: MailMutation | null = null;
  private generation = 0;
  private sequence = 0;
  private minimumCharacterVersion = 0;
  private current: MailCoordinatorState = this.initial();
  private readonly transport: MailTransport;
  private readonly persistence: MailPendingStore;

  constructor(transport: MailTransport, persistence: MailPendingStore) {
    this.transport = transport;
    this.persistence = persistence;
  }

  get state(): MailCoordinatorState {
    return structuredClone(this.current);
  }

  private initial(): MailCoordinatorState {
    return {
      status: 'closed',
      contextId: null,
      mails: [],
      rewards: [],
      summary: {
        unreadMailCount: 0,
        pendingCount: 0,
        asOf: 0,
      },
      characterVersion: 0,
      code: null,
      pendingOperationId: null,
    };
  }

  private key(): string {
    const i = this.identity!;
    return JSON.stringify(['mail', i.sessionId, i.sessionEpoch, i.characterId]);
  }

  init(identity: MailIdentity): void {
    ++this.generation;
    this.minimumCharacterVersion = 0;
    this.identity = { ...identity };
    this.current = this.initial();
    this.pending = null;

    const saved = this.persistence.load(this.key());
    if (saved !== null) {
      const command = parseAssetCommand(JSON.parse(saved));
      if (
        !['mail.markRead', 'mail.delete', 'mail.claimAttachment', 'reward.claim'].includes(command.command) ||
        command.sessionId !== identity.sessionId ||
        command.sessionEpoch !== identity.sessionEpoch ||
        !('characterId' in command.payload) ||
        command.payload.characterId !== identity.characterId
      ) {
        throw new Error('INVALID_PENDING_MAIL_COMMAND');
      }
      this.pending = command as MailMutation;
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

  async open(contextId: string): Promise<void> {
    if (!this.identity) throw new Error('IDENTITY_REQUIRED');
    const generation = ++this.generation;
    this.current.status = 'loading';
    this.current.contextId = contextId;
    this.current.code = null;

    await this.refresh(generation);
    if (generation === this.generation) {
      this.current.status = 'ready';
    }
  }

  private requireReady(): MailIdentity {
    if (!this.identity || !['ready'].includes(this.current.status) || this.pending) {
      throw new Error('MAIL_NOT_READY');
    }
    return this.identity;
  }

  async refreshSummary(): Promise<void> {
    if (!this.identity) throw new Error('IDENTITY_REQUIRED');
    const generation = this.generation;
    const query: AssetQuery = {
      protocolVersion: 2,
      query: 'delivery.summary',
      requestId: `mail-hud-${++this.sequence}`,
      sessionId: this.identity.sessionId,
      sessionEpoch: this.identity.sessionEpoch,
      payload: { characterId: this.identity.characterId },
    };
    const raw = await this.transport.send(encodeAssetRequest(query));
    if (generation !== this.generation) return;
    const res = decodeAssetResponse(query, raw) as AssetQueryResponse<'delivery.summary'>;
    if ('data' in res) {
      this.current.summary = {
        unreadMailCount: res.data.unreadMailCount,
        pendingCount: res.data.pendingCount,
        asOf: Number(res.data.asOf),
      };
    }
  }

  async refresh(generation = this.generation): Promise<void> {
    if (!this.identity || !this.current.contextId) return;

    // 1. Fetch mail list
    const mailQuery: AssetQuery = {
      protocolVersion: 2,
      query: 'mail.list',
      requestId: `mail-list-${++this.sequence}`,
      sessionId: this.identity.sessionId,
      sessionEpoch: this.identity.sessionEpoch,
      payload: {
        characterId: this.identity.characterId,
        contextId: this.current.contextId,
        cursor: null,
        pageRequest: 50,
      },
    };
    const rawMails = await this.transport.send(encodeAssetRequest(mailQuery));
    if (generation !== this.generation) return;
    const mailRes = decodeAssetResponse(mailQuery, rawMails) as AssetQueryResponse<'mail.list'>;
    if ('data' in mailRes) {
      this.current.mails = mailRes.data.entries.map(e => ({
        mailId: e.mailId,
        characterId: e.characterId,
        createdAt: Number(e.createdAt),
        expiresAt: Number(e.expiresAt),
        read: e.read,
        attachments: e.attachments.map(a => ({
          attachmentId: a.attachmentId,
          kind: a.kind,
          templateRef: a.templateRef,
          quantityGranted: a.quantityGranted,
          quantityClaimed: a.quantityClaimed,
          binding: a.binding,
        })),
      }));
    }

    // 2. Fetch reward list
    const rewardQuery: AssetQuery = {
      protocolVersion: 2,
      query: 'reward.list',
      requestId: `reward-list-${++this.sequence}`,
      sessionId: this.identity.sessionId,
      sessionEpoch: this.identity.sessionEpoch,
      payload: {
        characterId: this.identity.characterId,
        contextId: this.current.contextId,
        cursor: null,
        pageRequest: 50,
      },
    };
    const rawRewards = await this.transport.send(encodeAssetRequest(rewardQuery));
    if (generation !== this.generation) return;
    const rewardRes = decodeAssetResponse(rewardQuery, rawRewards) as AssetQueryResponse<'reward.list'>;
    if ('data' in rewardRes) {
      this.current.rewards = rewardRes.data.entries.map(e => ({
        grantId: e.grantId,
        itemId: e.itemId,
        characterId: e.characterId,
        createdAt: Number(e.createdAt),
        state: e.state,
      }));
    }

    // 3. Fetch summary
    await this.refreshSummary();
  }

  async markRead(mailId: string): Promise<void> {
    const identity = this.requireReady();
    if (!this.current.contextId) throw new Error('CONTEXT_REQUIRED');
    const command: MailMutation = {
      protocolVersion: 2,
      command: 'mail.markRead',
      operationId: `mail-read-${++this.sequence}`,
      sessionId: identity.sessionId,
      sessionEpoch: identity.sessionEpoch,
      expected: [
        { kind: 'character', id: identity.characterId, version: this.current.characterVersion },
      ],
      payload: {
        characterId: identity.characterId,
        contextId: this.current.contextId,
        mailId,
      },
    };
    await this.submit(command);
  }

  async deleteMail(mailId: string): Promise<void> {
    const identity = this.requireReady();
    if (!this.current.contextId) throw new Error('CONTEXT_REQUIRED');
    const command: MailMutation = {
      protocolVersion: 2,
      command: 'mail.delete',
      operationId: `mail-delete-${++this.sequence}`,
      sessionId: identity.sessionId,
      sessionEpoch: identity.sessionEpoch,
      expected: [
        { kind: 'character', id: identity.characterId, version: this.current.characterVersion },
      ],
      payload: {
        characterId: identity.characterId,
        contextId: this.current.contextId,
        mailId,
      },
    };
    await this.submit(command);
  }

  async claimAttachment(mailId: string, attachmentId: string): Promise<void> {
    const identity = this.requireReady();
    if (!this.current.contextId) throw new Error('CONTEXT_REQUIRED');
    const command: MailMutation = {
      protocolVersion: 2,
      command: 'mail.claimAttachment',
      operationId: `mail-claim-${++this.sequence}`,
      sessionId: identity.sessionId,
      sessionEpoch: identity.sessionEpoch,
      expected: [
        { kind: 'character', id: identity.characterId, version: this.current.characterVersion },
      ],
      payload: {
        characterId: identity.characterId,
        contextId: this.current.contextId,
        mailId,
        attachmentId,
      },
    };
    await this.submit(command);
  }

  async claimReward(grantId: string): Promise<void> {
    const identity = this.requireReady();
    if (!this.current.contextId) throw new Error('CONTEXT_REQUIRED');
    const command: MailMutation = {
      protocolVersion: 2,
      command: 'reward.claim',
      operationId: `reward-claim-${++this.sequence}`,
      sessionId: identity.sessionId,
      sessionEpoch: identity.sessionEpoch,
      expected: [
        { kind: 'character', id: identity.characterId, version: this.current.characterVersion },
      ],
      payload: {
        characterId: identity.characterId,
        contextId: this.current.contextId,
        grantId,
      },
    };
    await this.submit(command);
  }

  async claimAvailable(
    selection?: Array<{ mailId: string; attachmentId: string }>,
  ): Promise<{ totalDelivered: number; skippedCount: number; completed: boolean }> {
    const identity = this.requireReady();
    if (!this.current.contextId) throw new Error('CONTEXT_REQUIRED');

    const batchIntentId = `batch-${++this.sequence}`;
    let cursor: string | null = null;
    let isCompleted = false;
    let totalDelivered = 0;
    let skippedCount = 0;
    let isFirst = true;
    const runGeneration = this.generation;

    while (!isCompleted) {
      if (this.current.status === 'closed' || this.generation !== runGeneration) {
        break;
      }

      const command: MailMutation = {
        protocolVersion: 2,
        command: 'mail.claimAvailable',
        operationId: `mail-batch-step-${++this.sequence}`,
        sessionId: identity.sessionId,
        sessionEpoch: identity.sessionEpoch,
        expected: [
          { kind: 'character', id: identity.characterId, version: this.current.characterVersion },
        ],
        payload:
          isFirst && selection && selection.length > 0
            ? {
                characterId: identity.characterId,
                contextId: this.current.contextId,
                selection,
                batchIntentId,
              }
            : {
                characterId: identity.characterId,
                contextId: this.current.contextId,
                cursor,
                batchIntentId,
              },
      };

      isFirst = false;
      this.pending = command;
      this.persistence.save(this.key(), JSON.stringify(command));
      this.current.status = 'submitting';
      this.current.pendingOperationId = command.operationId;
      this.current.code = null;

      let raw: string;
      try {
        raw = await this.transport.send(encodeAssetRequest(command));
      } catch {
        if (this.generation === runGeneration) {
          this.current.status = 'unknown';
        }
        return { totalDelivered, skippedCount, completed: false };
      }

      if (this.generation !== runGeneration) {
        return { totalDelivered, skippedCount, completed: false };
      }

      const res = decodeAssetResponse(command, raw) as AssetResponse<'mail.claimAvailable'>;
      if (res.outcome.status === 'unknown') {
        this.current.status = 'unknown';
        return { totalDelivered, skippedCount, completed: false };
      }

      if (res.outcome.status === 'rejected') {
        this.current.status = 'failed';
        this.current.code = res.outcome.code;
        this.pending = null;
        this.current.pendingOperationId = null;
        this.persistence.save(this.key(), null);
        return { totalDelivered, skippedCount, completed: false };
      }

      const data = res.outcome.data;
      for (const item of data.items) {
        if (item.status === 'committed') {
          totalDelivered += item.deliveredQuantity;
        } else {
          skippedCount++;
        }
      }

      for (const v of res.outcome.resultVersions) {
        if (v.kind === 'character' && v.id === this.identity?.characterId) {
          this.current.characterVersion = Math.max(this.current.characterVersion, v.version);
        }
      }

      cursor = data.nextCursor;
      if (data.state === 'completed' || cursor === null) {
        isCompleted = true;
      }

      this.pending = null;
      this.current.pendingOperationId = null;
      this.persistence.save(this.key(), null);
    }

    if (this.generation === runGeneration) {
      await this.refresh(this.generation);
      if (this.generation === runGeneration) {
        this.current.status = 'ready';
      }
    }

    return { totalDelivered, skippedCount, completed: isCompleted };
  }

  private async submit(command: MailMutation): Promise<void> {
    const generation = this.generation;
    this.pending = command;
    this.persistence.save(this.key(), JSON.stringify(command));
    this.current.status = 'submitting';
    this.current.pendingOperationId = command.operationId;
    this.current.code = null;

    let raw: string;
    try {
      raw = await this.transport.send(encodeAssetRequest(command));
    } catch {
      if (generation === this.generation) {
        this.current.status = 'unknown';
      }
      return;
    }

    if (generation !== this.generation) return;
    const res = decodeAssetResponse(command, raw) as AssetResponse;
    await this.applyOutcome(command, res);
  }

  private async applyOutcome(command: MailMutation, res: AssetResponse): Promise<void> {
    if (res.outcome.status === 'unknown') {
      this.current.status = 'unknown';
      return;
    }

    if (res.outcome.status === 'rejected') {
      this.current.status = 'failed';
      this.current.code = res.outcome.code;
      this.pending = null;
      this.current.pendingOperationId = null;
      this.persistence.save(this.key(), null);
      return;
    }

    // Committed outcome
    const versions = res.outcome.resultVersions;
    for (const v of versions) {
      if (v.kind === 'character' && v.id === this.identity?.characterId) {
        this.current.characterVersion = Math.max(this.current.characterVersion, v.version);
      }
    }

    this.pending = null;
    this.current.pendingOperationId = null;
    this.persistence.save(this.key(), null);

    // Refresh updated data
    await this.refresh(this.generation);
    if (this.generation === this.generation) {
      this.current.status = 'ready';
    }
  }

  async recover(): Promise<void> {
    if (!this.identity || !this.pending || this.current.status !== 'unknown') {
      return;
    }

    const command = this.pending;
    const query: AssetQuery = {
      protocolVersion: 2,
      query: 'operation.get',
      requestId: `recover-${++this.sequence}`,
      sessionId: this.identity.sessionId,
      sessionEpoch: this.identity.sessionEpoch,
      payload: { operationId: command.operationId },
    };

    let raw: string;
    try {
      raw = await this.transport.send(encodeAssetRequest(query));
    } catch {
      return;
    }

    const res = decodeAssetResponse(query, raw) as AssetQueryResponse<'operation.get'>;
    if ('data' in res && res.data.status === 'found') {
      const orig = res.data.result as AssetResponse;
      await this.applyOutcome(command, orig);
    }
  }
}
