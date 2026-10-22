import { parseLoginRequest, parseLoginResponse } from '../../../shared/src/protocol/session-v2.ts';
import type { LoginRequest, LoginResponse } from '../../../shared/src/protocol/session-v2.ts';
import { time } from '../../../shared/src/exact-values.ts';
import type { Store, Clock, Transaction } from '../ports/store.ts';
import { CommitUnknown, StoreUnavailable } from '../ports/store.ts';
import { identityKey, isVerifiedIdentity, loginKey } from './identity-v2.ts';
import type { IdentityPort } from './identity-v2.ts';
import type { IdentityLink, LoginAccount, LoginAttempt, LoginSession, LoginReceipt } from './login-model.ts';
import { handoff } from './login-handoff.ts';

export interface LoginOptions { store: Store; clock: Clock; identity: IdentityPort; ticketTtlMs: number; initialUnlocks: Record<string, string[]>; holdingsDomainRef: string; }
export class LoginService {
  private readonly options: LoginOptions;
  constructor(options: LoginOptions) {
    if (!Number.isSafeInteger(options.ticketTtlMs) || options.ticketTtlMs < 1 || options.ticketTtlMs > 300000) throw new Error('INVALID_LOGIN_CONFIG');
    if (typeof options.holdingsDomainRef !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(options.holdingsDomainRef)) throw new Error('INVALID_LOGIN_CONFIG');
    this.options = { ...options, initialUnlocks: structuredClone(options.initialUnlocks) };
  }
  async execute(value: unknown): Promise<LoginResponse> {
    const request = parseLoginRequest(value);
    const operationId = request.command === 'session.prepare' ? request.payload.prepareOperationId : request.payload.openOperationId;
    const reject = (code: 'AUTH_REQUIRED' | 'SERVICE_UNAVAILABLE'): LoginResponse => ({ protocolVersion: 2, command: request.command, operationId, serverTime: time(this.options.clock.now()), replayed: false, outcome: { status: 'rejected', code } });
    let identity;
    try { identity = await this.options.identity.verify(); } catch { return reject('AUTH_REQUIRED'); }
    if (!isVerifiedIdentity(identity)) return reject('AUTH_REQUIRED');
    const identityId = await identityKey(identity), tuple = JSON.stringify([identity.provider, identity.appId, identity.subject, identity.environment]);
    const launchHash = await loginKey('launch', [identityId, request.payload.launchId]);
    const sessionId = await loginKey('session', [identityId, request.payload.launchId]);
    try {
      if (request.command === 'session.commit') return await this.commit(request, identityId, tuple, launchHash, sessionId);
      const ticketId = await loginKey('attempt', [identityId, request.payload.launchId, request.payload.prepareOperationId]);
      const intentTuple = JSON.stringify([identityId, request.payload.launchId, request.payload.prepareOperationId]);
      return await this.options.store.run(async tx => {
        const now = time(this.options.clock.now());
        const link = await tx.get<IdentityLink>(identityId);
        if (link && (link.schemaVersion !== 2 || link.tuple !== tuple)) throw new Error('IDENTITY_INTEGRITY');
        const account = link ? await tx.get<LoginAccount>(link.accountId) : undefined;
        if (link && !account) throw new Error('ACCOUNT_INTEGRITY');
        const previous = await tx.get<LoginAttempt>(ticketId);
        if (previous && (previous.tuple !== intentTuple || previous.identityKey !== identityId)) throw new Error('ATTEMPT_INTEGRITY');
        const session = await tx.get<LoginSession>(sessionId);
        if (session?.status === 'revoked') return parseLoginResponse({ protocolVersion: 2, command: request.command, operationId, serverTime: now, replayed: false, outcome: { status: 'rejected', code: 'SESSION_REVOKED' } });
        const ticket: LoginAttempt = previous ?? { schemaVersion: 2, id: ticketId, identityKey: identityId, tuple: intentTuple, launchIdHash: launchHash, baseAccountId: account?.id ?? null, baseSessionEpoch: account?.sessionEpoch ?? 0, issuedAt: now, expiresAt: time(now + this.options.ticketTtlMs), status: 'prepared' };
        if (!previous) tx.set(ticketId, ticket);
        return parseLoginResponse({ protocolVersion: 2, command: request.command, operationId, serverTime: now, replayed: !!previous, outcome: { status: 'committed', data: { ticketId, launchId: request.payload.launchId, baseSessionEpoch: ticket.baseSessionEpoch, issuedAt: ticket.issuedAt, expiresAt: ticket.expiresAt } } });
      });
    } catch (error) {
      if (error instanceof CommitUnknown) return { protocolVersion: 2, command: request.command, operationId, serverTime: time(this.options.clock.now()), replayed: false, outcome: { status: 'unknown', code: 'RESULT_UNKNOWN' } };
      if (error instanceof StoreUnavailable) return reject('SERVICE_UNAVAILABLE');
      throw error;
    }
  }
  private async commit(request: Extract<LoginRequest, { command: 'session.commit' }>, identityId: string, identityTuple: string, launchHash: string, sessionId: string): Promise<LoginResponse> {
    const { openOperationId: operationId, ticketId, launchId } = request.payload;
    const tuple = JSON.stringify([identityId, launchId, operationId, ticketId]);
    const receiptId = await loginKey('open', [identityId, launchId, operationId]);
    const candidateAccountId = await loginKey('account', [identityId]);
    const walletId = await loginKey('wallet', [candidateAccountId]), vaultId = await loginKey('accountVault', [candidateAccountId]);
    const holdingsId = await loginKey('holdings', [candidateAccountId, 'account']);
    const journalId = await loginKey('journal', [candidateAccountId, operationId]);
    return this.options.store.run(async tx => {
      const now = time(this.options.clock.now());
      // Handoff produces transaction-local decisions. Publish none of them if a later deadline check fails.
      const changes = new Map<string, unknown>();
      const planned: Transaction = {
        get: async <T>(key: string) => changes.has(key) ? structuredClone(changes.get(key)) as T : tx.get<T>(key),
        set: (key, value) => { changes.set(key, structuredClone(value)); },
      };
      const reject = (code: string, persist = true) => {
        const result = parseLoginResponse({ protocolVersion: 2, command: request.command, operationId, serverTime: time(this.options.clock.now()), replayed: false, outcome: { status: 'rejected', code } });
        if (persist) tx.set(receiptId, { schemaVersion: 2, id: receiptId, identityKey: identityId, tuple, result } satisfies LoginReceipt);
        return result;
      };
      const link = await tx.get<IdentityLink>(identityId);
      if (link && (link.schemaVersion !== 2 || link.tuple !== identityTuple)) throw new Error('IDENTITY_INTEGRITY');
      let account = link ? await tx.get<LoginAccount>(link.accountId) : undefined;
      if (link && (!account || account.schemaVersion !== 2)) throw new Error('ACCOUNT_INTEGRITY');
      const original = await tx.get<LoginReceipt>(receiptId);
      if (original) {
        if (original.tuple !== tuple || original.identityKey !== identityId) return reject('OPERATION_MISMATCH', false);
        if (original.result.command !== 'session.commit' || original.result.outcome.status === 'unknown') throw new Error('RECEIPT_INTEGRITY');
        if (original.result.outcome.status === 'rejected') return parseLoginResponse({ ...original.result, replayed: true });
        if (!account) throw new Error('RECEIPT_INTEGRITY');
        const result = structuredClone(original.result);
        if (result.command === 'session.commit' && result.outcome.status === 'committed') result.outcome.data.sessionState = account.currentSessionId === result.outcome.data.sessionId && account.sessionEpoch === result.outcome.data.sessionEpoch ? 'current' : 'superseded';
        return parseLoginResponse({ ...result, replayed: true });
      }
      const ticket = await tx.get<LoginAttempt>(ticketId);
      if (!ticket || ticket.identityKey !== identityId || ticket.launchIdHash !== launchHash || ticket.id !== ticketId) return reject('NOT_FOUND_OR_FORBIDDEN');
      if (ticket.status !== 'prepared') return reject('OPERATION_MISMATCH');
      if (now >= ticket.expiresAt) return reject('DEADLINE_EXPIRED');
      if (ticket.baseAccountId !== (account?.id ?? null) || ticket.baseSessionEpoch !== (account?.sessionEpoch ?? 0)) return reject('VERSION_CONFLICT');
      const existingSession = await tx.get<LoginSession>(sessionId);
      if (existingSession) return reject('SESSION_REVOKED');
      const accountId = account?.id ?? candidateAccountId;
      const handoffResult = account ? await handoff(planned, account, now, operationId, receiptId) : undefined;
      if (handoffResult) account = handoffResult.account;
      if (!account) {
        for (const key of [candidateAccountId, walletId, vaultId, journalId, holdingsId]) if (await tx.get(key) !== undefined) throw new Error('INITIALIZATION_INTEGRITY');
      }
      const epoch = (account?.sessionEpoch ?? 0) + 1;
      if (!Number.isSafeInteger(epoch) || (account && (!Number.isSafeInteger(account.version + 1) || !Number.isSafeInteger(account.writeRevision + 1)))) throw new Error('SESSION_EPOCH_OVERFLOW');
      const next: LoginAccount = account ? { ...account, currentSessionId: sessionId, sessionEpoch: epoch, version: account.version + 1, writeRevision: account.writeRevision + 1, updatedAt: now } : {
        schemaVersion: 2, id: accountId, version: 0, writeRevision: 0, createdAt: now, updatedAt: now, currentSessionId: sessionId, sessionEpoch: epoch,
        characterIdsByClass: {}, walletId, accountVaultId: vaultId, dungeonUnlocks: structuredClone(this.options.initialUnlocks),
      };
      if (account?.currentSessionId) {
        const previous = await tx.get<LoginSession>(account.currentSessionId);
        if (!previous || previous.accountId !== accountId || previous.epoch !== account.sessionEpoch) throw new Error('SESSION_INTEGRITY');
        planned.set(previous.id, { ...previous, status: 'revoked', revokedAt: now });
      }
      const result = parseLoginResponse({ protocolVersion: 2, command: request.command, operationId, serverTime: now, replayed: false, outcome: {
        status: 'committed', data: { sessionId, sessionEpoch: epoch, sessionState: 'current', characters: handoffResult?.characters ?? [], selectedCharacter: handoffResult?.selectedCharacter ?? null }, resultVersions: [{ kind: 'account', id: accountId, version: next.version }, ...(handoffResult?.resultVersions ?? [])],
      } });
      if (!account) {
        planned.set(identityId, { schemaVersion: 2, id: identityId, tuple: identityTuple, accountId } satisfies IdentityLink);
        planned.set(walletId, { schemaVersion: 2, id: walletId, accountId, version: 0, createdAt: now, updatedAt: now, gold: '0', points: '0' });
        planned.set(vaultId, { schemaVersion: 2, id: vaultId, accountId, version: 0, createdAt: now, updatedAt: now, kind: 'accountVault', capacity: 100, unlockStage: null, slots: {} });
        planned.set(holdingsId, { schemaVersion: 2, id: holdingsId, accountId, scope: 'account', revision: 0, domainRef: this.options.holdingsDomainRef, entries: [] });
        planned.set(journalId, { schemaVersion: 2, accountId, operationId, sourceId: receiptId, command: 'account.initialize', occurredAt: now, changes: [{ kind: 'walletCreated', id: walletId }, { kind: 'accountVaultCreated', id: vaultId }, { kind: 'holdingsCreated', id: holdingsId }] });
      }
      planned.set(accountId, next);
      planned.set(sessionId, { schemaVersion: 2, id: sessionId, accountId, launchIdHash: launchHash, epoch, status: 'active', openedAt: now } satisfies LoginSession);
      planned.set(ticketId, { ...ticket, status: 'committed', committedOpenRef: receiptId } satisfies LoginAttempt);
      planned.set(receiptId, { schemaVersion: 2, id: receiptId, identityKey: identityId, tuple, result } satisfies LoginReceipt);
      if (time(this.options.clock.now()) >= ticket.expiresAt) return reject('DEADLINE_EXPIRED');
      for (const [key, value] of changes) tx.set(key, value);
      return result;
    });
  }
}
