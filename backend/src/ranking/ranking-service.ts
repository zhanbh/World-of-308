import type { Store, Transaction, Clock } from '../ports/store.ts';
import { time } from '../../../shared/src/exact-values.ts';
import {
  parseAssetQuery,
  parseAssetQueryResponse,
} from '../../../shared/src/protocol/asset-v2.ts';
import type {
  AssetQuery,
  AssetQueryResponse,
} from '../../../shared/src/protocol/asset-v2.ts';
import type { RankingEntryEntity } from '../equipment/equipment-model.ts';
import type { LoginAccount, LoginSession } from '../identity/login-model.ts';
import {
  type RankingScope,
  type RankingCursorPayload,
  type RankingEntryView,
  type RankCacheEntity,
  rankCacheKey,
  isRankingEntryEntity,
} from './ranking-model.ts';

export interface RankingServiceOptions {
  store: Store;
  clock: Clock;
  secret?: Uint8Array | string;
  scoreConfigRef?: string;
  defaultPageSize?: number;
  maxPageSize?: number;
  cursorTtlMs?: number;
  freshTtlMs?: number;
  maxStaleMs?: number;
  leaseTtlMs?: number;
  cacheSize?: number;
}

const DEFAULT_SECRET = new TextEncoder().encode('ranking-cursor-secret-v1-308-world');
const DEFAULT_SCORE_CONFIG_REF = 'score-v1';
const DEFAULT_CURSOR_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_FRESH_TTL_MS = 15 * 1000; // 15 seconds
const DEFAULT_MAX_STALE_MS = 60 * 1000; // 60 seconds
const DEFAULT_LEASE_TTL_MS = 3 * 1000; // 3 seconds
const DEFAULT_CACHE_SIZE = 50;

export function compareRankingEntries(a: RankingEntryEntity, b: RankingEntryEntity): number {
  const scoreA = BigInt(a.score);
  const scoreB = BigInt(b.score);
  if (scoreB !== scoreA) {
    return scoreB > scoreA ? 1 : -1;
  }
  if (a.scoreReachedAt !== b.scoreReachedAt) {
    return a.scoreReachedAt - b.scoreReachedAt;
  }
  if (a.characterId !== b.characterId) {
    return a.characterId < b.characterId ? -1 : 1;
  }
  return 0;
}

function isAfterCursor(e: RankingEntryEntity, c: RankingCursorPayload): boolean {
  const scoreE = BigInt(e.score);
  const scoreC = BigInt(c.score);
  if (scoreE < scoreC) return true;
  if (scoreE > scoreC) return false;
  if (e.scoreReachedAt > c.reachedAt) return true;
  if (e.scoreReachedAt < c.reachedAt) return false;
  return e.characterId > c.charId;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export class RankingService {
  private readonly options: RankingServiceOptions;
  private readonly secretBytes: Uint8Array;
  private readonly scoreConfigRef: string;
  private readonly cursorTtlMs: number;
  private readonly freshTtlMs: number;
  private readonly maxStaleMs: number;
  private readonly leaseTtlMs: number;
  private readonly cacheSize: number;

  constructor(options: RankingServiceOptions) {
    this.options = { ...options };
    if (!options.secret) {
      this.secretBytes = DEFAULT_SECRET;
    } else if (typeof options.secret === 'string') {
      this.secretBytes = new TextEncoder().encode(options.secret);
    } else {
      this.secretBytes = new Uint8Array(options.secret);
    }
    this.scoreConfigRef = options.scoreConfigRef ?? DEFAULT_SCORE_CONFIG_REF;
    this.cursorTtlMs = options.cursorTtlMs ?? DEFAULT_CURSOR_TTL_MS;
    this.freshTtlMs = options.freshTtlMs ?? DEFAULT_FRESH_TTL_MS;
    this.maxStaleMs = options.maxStaleMs ?? DEFAULT_MAX_STALE_MS;
    this.leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE;
  }

  private async sign(data: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      this.secretBytes as Uint8Array<ArrayBuffer>,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBytes = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)),
    );
    return base64UrlEncode(sigBytes);
  }

  async encodeCursor(payload: RankingCursorPayload): Promise<string> {
    const jsonStr = JSON.stringify(payload);
    const payloadEncoded = base64UrlEncode(new TextEncoder().encode(jsonStr));
    const sig = await this.sign(payloadEncoded);
    return `${payloadEncoded}.${sig}`;
  }

  async decodeCursor(
    cursorStr: string,
    expectedScope: RankingScope,
    expectedConfigRef: string,
    now: number,
  ): Promise<RankingCursorPayload> {
    if (typeof cursorStr !== 'string' || cursorStr.length === 0 || cursorStr.length > 512) {
      throw new Error('INVALID_CURSOR_LENGTH');
    }
    const dotIndex = cursorStr.indexOf('.');
    if (dotIndex <= 0) {
      throw new Error('INVALID_CURSOR_FORMAT');
    }
    const payloadPart = cursorStr.slice(0, dotIndex);
    const sigPart = cursorStr.slice(dotIndex + 1);
    const expectedSig = await this.sign(payloadPart);
    if (sigPart !== expectedSig) {
      throw new Error('CURSOR_SIGNATURE_MISMATCH');
    }
    let payload: RankingCursorPayload;
    try {
      const jsonBytes = base64UrlDecode(payloadPart);
      payload = JSON.parse(new TextDecoder().decode(jsonBytes));
    } catch {
      throw new Error('CURSOR_PAYLOAD_CORRUPT');
    }
    if (payload.v !== 1) {
      throw new Error('CURSOR_VERSION_UNSUPPORTED');
    }
    if (payload.scope !== expectedScope) {
      throw new Error('CURSOR_SCOPE_MISMATCH');
    }
    if (payload.configRef !== expectedConfigRef) {
      throw new Error('CURSOR_CONFIG_REF_MISMATCH');
    }
    if (typeof payload.iat !== 'number' || now - payload.iat > this.cursorTtlMs || payload.iat > now + 60000) {
      throw new Error('CURSOR_EXPIRED');
    }
    return payload;
  }

  private collectEntriesFromStore(scope: RankingScope): { filtered: RankingEntryEntity[]; sorted: RankingEntryEntity[] } {
    const entries: RankingEntryEntity[] = [];
    if ('snapshot' in this.options.store && typeof (this.options.store as any).snapshot === 'function') {
      const snap: Map<string, unknown> = (this.options.store as any).snapshot();
      for (const val of snap.values()) {
        if (isRankingEntryEntity(val) && val.scoreConfigRef === this.scoreConfigRef) {
          entries.push(val);
        }
      }
    }

    const filtered = entries.filter(e => {
      if (scope === 'warrior') return e.classId === 'warrior';
      if (scope === 'hunter') return e.classId === 'hunter';
      return true;
    });

    const sorted = filtered.sort(compareRankingEntries);
    return { filtered, sorted };
  }

  private toEntryViews(entries: RankingEntryEntity[], sorted: RankingEntryEntity[]): RankingEntryView[] {
    return entries.map(e => ({
      character: {
        characterId: e.characterId,
        classId: e.classId,
        characterName: e.characterName,
        level: e.level,
      },
      rank: sorted.indexOf(e) + 1,
      score: {
        basis: 'intrinsicEquipmentValue' as const,
        value: e.score,
        scoreConfigRef: e.scoreConfigRef,
        equipmentVersion: e.equipmentVersion,
        scoreReachedAt: time(e.scoreReachedAt),
      },
    }));
  }

  async query(rawInput: unknown): Promise<AssetQueryResponse<'ranking.list'>> {
    let parsed: AssetQuery;
    try {
      parsed = parseAssetQuery(rawInput);
    } catch (e) {
      throw e;
    }
    if (parsed.query !== 'ranking.list') {
      throw new TypeError('UNSUPPORTED_QUERY');
    }

    const { requestId, sessionId, sessionEpoch, payload } = parsed;
    const { scope, cursor, pageRequest } = payload;
    const now = this.options.clock.now();

    return await this.options.store.run(async (tx: Transaction) => {
      // 1. Resolve ownRank if session is present and authenticated
      let ownRank: number | null = null;
      let ownCharacterId: string | null = null;
      if (sessionId) {
        try {
          const session = await tx.get<LoginSession>(sessionId);
          if (session && session.status === 'active' && session.epoch === sessionEpoch) {
            const account = await tx.get<LoginAccount>(session.accountId);
            if (account?.selectedCharacterId) {
              ownCharacterId = account.selectedCharacterId;
            }
          }
        } catch {
          ownRank = null;
        }
      }

      // 2. Cursor query (subsequent pages): directly query indexed sorted entries without caching
      if (cursor != null) {
        let decodedCursor: RankingCursorPayload;
        try {
          decodedCursor = await this.decodeCursor(cursor, scope, this.scoreConfigRef, now);
        } catch {
          return parseAssetQueryResponse('ranking.list', {
            requestId,
            serverTime: time(now),
            error: { code: 'INVALID_ARGUMENT' },
          });
        }

        const { sorted } = this.collectEntriesFromStore(scope);
        if (ownCharacterId) {
          const ownIdx = sorted.findIndex(e => e.characterId === ownCharacterId);
          if (ownIdx >= 0) ownRank = ownIdx + 1;
        }

        const remaining = sorted.filter(e => isAfterCursor(e, decodedCursor));
        const pageEntries = remaining.slice(0, pageRequest);
        const remainingCount = remaining.length - pageEntries.length;

        let nextCursor: string | null = null;
        if (remainingCount > 0 && pageEntries.length > 0) {
          const lastItem = pageEntries[pageEntries.length - 1];
          const lastRank = sorted.indexOf(lastItem) + 1;
          nextCursor = await this.encodeCursor({
            v: 1,
            scope,
            configRef: this.scoreConfigRef,
            rank: lastRank,
            score: lastItem.score,
            reachedAt: lastItem.scoreReachedAt,
            charId: lastItem.characterId,
            iat: now,
          });
        }

        const resultViews = this.toEntryViews(pageEntries, sorted);
        return parseAssetQueryResponse('ranking.list', {
          requestId,
          serverTime: time(now),
          versions: [],
          data: {
            entries: resultViews,
            ownRank,
            rankAsOf: time(now),
            stale: false,
            nextCursor,
          },
        });
      }

      // 3. First page query (cursor == null): use rankCaches with 15s fresh TTL, 60s max stale fallback, and 3s CAS lease
      const cacheKey = await rankCacheKey(scope, this.scoreConfigRef);
      const cache = await tx.get<RankCacheEntity>(cacheKey);

      const cacheAge = cache ? now - cache.cachedAt : Infinity;
      const isFresh = cache != null && cacheAge <= this.freshTtlMs;
      const isStaleUsable = cache != null && cacheAge > this.freshTtlMs && cacheAge <= this.maxStaleMs;
      const isLeaseActive = cache?.lease != null && now < cache.lease.expiresAt;

      // Case A: Fresh cache hit (<= 15s)
      if (isFresh && cache) {
        const pageViews = cache.entries.slice(0, pageRequest);
        let nextCursor: string | null = null;
        if (cache.totalAvailable > pageViews.length && pageViews.length > 0) {
          const lastItem = pageViews[pageViews.length - 1];
          nextCursor = await this.encodeCursor({
            v: 1,
            scope,
            configRef: this.scoreConfigRef,
            rank: lastItem.rank ?? pageViews.length,
            score: lastItem.score.value,
            reachedAt: Number(lastItem.score.scoreReachedAt),
            charId: lastItem.character.characterId,
            iat: now,
          });
        }

        if (ownCharacterId) {
          const inCache = cache.entries.find(e => e.character.characterId === ownCharacterId);
          if (inCache && inCache.rank != null) {
            ownRank = inCache.rank;
          } else {
            const { sorted } = this.collectEntriesFromStore(scope);
            const ownIdx = sorted.findIndex(e => e.characterId === ownCharacterId);
            if (ownIdx >= 0) ownRank = ownIdx + 1;
          }
        }

        return parseAssetQueryResponse('ranking.list', {
          requestId,
          serverTime: time(now),
          versions: [],
          data: {
            entries: pageViews,
            ownRank,
            rankAsOf: time(cache.cachedAt),
            stale: false,
            nextCursor,
          },
        });
      }

      // Case B: Stale cache fallback (15s < age <= 60s) with active lease held by another worker
      if (isStaleUsable && isLeaseActive && cache) {
        const pageViews = cache.entries.slice(0, pageRequest);
        let nextCursor: string | null = null;
        if (cache.totalAvailable > pageViews.length && pageViews.length > 0) {
          const lastItem = pageViews[pageViews.length - 1];
          nextCursor = await this.encodeCursor({
            v: 1,
            scope,
            configRef: this.scoreConfigRef,
            rank: lastItem.rank ?? pageViews.length,
            score: lastItem.score.value,
            reachedAt: Number(lastItem.score.scoreReachedAt),
            charId: lastItem.character.characterId,
            iat: now,
          });
        }

        if (ownCharacterId) {
          const inCache = cache.entries.find(e => e.character.characterId === ownCharacterId);
          if (inCache && inCache.rank != null) {
            ownRank = inCache.rank;
          }
        }

        return parseAssetQueryResponse('ranking.list', {
          requestId,
          serverTime: time(now),
          versions: [],
          data: {
            entries: pageViews,
            ownRank,
            rankAsOf: time(cache.cachedAt),
            stale: true,
            nextCursor,
          },
        });
      }

      // Case C: Cache refresh required (either stale without active lease, expired > 60s, or missing)
      // If another worker holds active lease but cache is missing or > 60s, do bounded direct query
      if (isLeaseActive && !isStaleUsable) {
        const { sorted } = this.collectEntriesFromStore(scope);
        if (ownCharacterId) {
          const ownIdx = sorted.findIndex(e => e.characterId === ownCharacterId);
          if (ownIdx >= 0) ownRank = ownIdx + 1;
        }

        const pageEntries = sorted.slice(0, pageRequest);
        let nextCursor: string | null = null;
        if (sorted.length > pageEntries.length && pageEntries.length > 0) {
          const lastItem = pageEntries[pageEntries.length - 1];
          nextCursor = await this.encodeCursor({
            v: 1,
            scope,
            configRef: this.scoreConfigRef,
            rank: sorted.indexOf(lastItem) + 1,
            score: lastItem.score,
            reachedAt: lastItem.scoreReachedAt,
            charId: lastItem.characterId,
            iat: now,
          });
        }

        return parseAssetQueryResponse('ranking.list', {
          requestId,
          serverTime: time(now),
          versions: [],
          data: {
            entries: this.toEntryViews(pageEntries, sorted),
            ownRank,
            rankAsOf: time(now),
            stale: false,
            nextCursor,
          },
        });
      }

      // Acquire 3-second refresh lease
      const leaseToken = `lease:${now}:${Math.random().toString(36).slice(2, 10)}`;
      if (cache) {
        try {
          tx.set(cacheKey, {
            ...cache,
            lease: { token: leaseToken, expiresAt: now + this.leaseTtlMs },
          });
        } catch {
          // Non-fatal: if lease staging fails, proceed with query
        }
      }

      // Compute fresh dataset from store
      const { sorted } = this.collectEntriesFromStore(scope);
      if (ownCharacterId) {
        const ownIdx = sorted.findIndex(e => e.characterId === ownCharacterId);
        if (ownIdx >= 0) ownRank = ownIdx + 1;
      }

      const cachedViews = this.toEntryViews(sorted.slice(0, this.cacheSize), sorted);
      const pageViews = cachedViews.slice(0, pageRequest);

      let nextCursor: string | null = null;
      if (sorted.length > pageViews.length && pageViews.length > 0) {
        const lastItem = pageViews[pageViews.length - 1];
        nextCursor = await this.encodeCursor({
          v: 1,
          scope,
          configRef: this.scoreConfigRef,
          rank: lastItem.rank ?? pageViews.length,
          score: lastItem.score.value,
          reachedAt: Number(lastItem.score.scoreReachedAt),
          charId: lastItem.character.characterId,
          iat: now,
        });
      }

      // Commit fresh cache with incremented version and released lease
      const freshCache: RankCacheEntity = {
        schemaVersion: 2,
        id: cacheKey,
        scope,
        scoreConfigRef: this.scoreConfigRef,
        version: (cache?.version ?? 0) + 1,
        cachedAt: now,
        entries: cachedViews,
        totalAvailable: sorted.length,
        hasMore: sorted.length > cachedViews.length,
        lease: null,
      };

      try {
        // CAS check: if an existing cache was in place, verify lease token wasn't overtaken
        const latest = await tx.get<RankCacheEntity>(cacheKey);
        if (!latest || !latest.lease || latest.lease.token === leaseToken || now >= latest.lease.expiresAt) {
          tx.set(cacheKey, freshCache);
        }
      } catch {
        // Non-fatal: cache write failure must not throw or rollback character facts
      }

      return parseAssetQueryResponse('ranking.list', {
        requestId,
        serverTime: time(now),
        versions: [],
        data: {
          entries: pageViews,
          ownRank,
          rankAsOf: time(now),
          stale: false,
          nextCursor,
        },
      });
    });
  }
}
