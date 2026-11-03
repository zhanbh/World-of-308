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
}

const DEFAULT_SECRET = new TextEncoder().encode('ranking-cursor-secret-v1-308-world');
const DEFAULT_SCORE_CONFIG_REF = 'score-v1';
const DEFAULT_CURSOR_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
      // 1. Gather all ranking entries matching scoreConfigRef from store snapshot
      const entries: RankingEntryEntity[] = [];
      if ('snapshot' in this.options.store && typeof (this.options.store as any).snapshot === 'function') {
        const snap: Map<string, unknown> = (this.options.store as any).snapshot();
        for (const val of snap.values()) {
          if (isRankingEntryEntity(val) && val.scoreConfigRef === this.scoreConfigRef) {
            entries.push(val);
          }
        }
      }

      // 2. Filter by scope ('all' | 'warrior' | 'hunter')
      const filtered = entries.filter(e => {
        if (scope === 'warrior') return e.classId === 'warrior';
        if (scope === 'hunter') return e.classId === 'hunter';
        return true;
      });

      // 3. Stable triad sort: (score DESC, scoreReachedAt ASC, characterId ASC)
      const sorted = filtered.sort(compareRankingEntries);

      // 4. Resolve ownRank if session is present and authenticated
      let ownRank: number | null = null;
      if (sessionId) {
        try {
          const session = await tx.get<LoginSession>(sessionId);
          if (session && session.status === 'active' && session.epoch === sessionEpoch) {
            const account = await tx.get<LoginAccount>(session.accountId);
            if (account?.selectedCharacterId) {
              const idx = sorted.findIndex(e => e.characterId === account.selectedCharacterId);
              if (idx >= 0) {
                ownRank = idx + 1;
              }
            }
          }
        } catch {
          // Gracefully default to null on session resolution failure
          ownRank = null;
        }
      }

      // 5. Cursor pagination
      let pageEntries: RankingEntryEntity[] = [];
      let remainingCount = 0;

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

        const remaining = sorted.filter(e => isAfterCursor(e, decodedCursor));
        pageEntries = remaining.slice(0, pageRequest);
        remainingCount = remaining.length - pageEntries.length;
      } else {
        pageEntries = sorted.slice(0, pageRequest);
        remainingCount = sorted.length - pageEntries.length;
      }

      // 6. Generate nextCursor if more entries remain
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

      // 7. Assemble entries views
      const resultViews: RankingEntryView[] = pageEntries.map(e => ({
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
    });
  }
}
