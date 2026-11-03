import type { RankingScope } from '../../../../backend/src/ranking/ranking-model.ts';
import type {
  AssetQuery,
  AssetQueryResponse,
} from '../../../../shared/src/protocol/asset-v2.ts';
import {
  parseAssetQueryResponse,
} from '../../../../shared/src/protocol/asset-v2.ts';

export type { RankingScope };

export interface RankingItemView {
  characterId: string;
  classId: 'warrior' | 'hunter';
  characterName: string;
  level: number;
  rank: number | null;
  score: string;
  scoreConfigRef: string;
  equipmentVersion: number;
  scoreReachedAt: number;
}

export type RankingCoordinatorStatus =
  | 'closed'
  | 'loading'
  | 'ready'
  | 'paging'
  | 'failed';

export interface RankingCoordinatorState {
  status: RankingCoordinatorStatus;
  scope: RankingScope;
  entries: RankingItemView[];
  ownRank: number | null;
  rankAsOf: number | null;
  stale: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  pageSize: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface RankingIdentity {
  sessionId: string;
  sessionEpoch: number;
  characterId: string;
}

export interface RankingTransport {
  send(jsonText: string): Promise<string>;
}

export type RankingQueryHandler =
  | RankingTransport
  | ((query: AssetQuery) => Promise<AssetQueryResponse<'ranking.list'> | string>);

type RankingEntryWire = Extract<AssetQueryResponse<'ranking.list'>, { data: unknown }>['data']['entries'][number];

function toItemView(raw: RankingEntryWire): RankingItemView {
  return {
    characterId: raw.character.characterId,
    classId: raw.character.classId,
    characterName: raw.character.characterName,
    level: raw.character.level,
    rank: raw.rank,
    score: raw.score.value,
    scoreConfigRef: raw.score.scoreConfigRef,
    equipmentVersion: raw.score.equipmentVersion,
    scoreReachedAt: Number(raw.score.scoreReachedAt),
  };
}


export class RankingCoordinator {
  private identity: RankingIdentity | null = null;
  private generation = 0;
  private current: RankingCoordinatorState;
  private readonly transport?: RankingQueryHandler;
  private readonly listeners = new Set<(state: RankingCoordinatorState) => void>();

  constructor(transport?: RankingQueryHandler, defaultPageSize = 20) {
    this.transport = transport;
    this.current = this.initialState(defaultPageSize);
  }

  private initialState(pageSize = 20): RankingCoordinatorState {
    return {
      status: 'closed',
      scope: 'all',
      entries: [],
      ownRank: null,
      rankAsOf: null,
      stale: false,
      hasMore: false,
      nextCursor: null,
      pageSize: Math.max(1, Math.min(50, pageSize)),
      errorCode: null,
      errorMessage: null,
    };
  }

  get state(): RankingCoordinatorState {
    return structuredClone(this.current);
  }

  get currentGeneration(): number {
    return this.generation;
  }

  subscribe(listener: (state: RankingCoordinatorState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.state;
    for (const fn of this.listeners) {
      fn(s);
    }
  }

  private async executeQuery(
    scope: RankingScope,
    cursor: string | null,
    gen: number,
  ): Promise<void> {
    if (!this.transport) {
      if (gen === this.generation) {
        this.current.status = 'failed';
        this.current.errorCode = 'TRANSPORT_UNAVAILABLE';
        this.current.errorMessage = '通信组件未配置';
        this.notify();
      }
      return;
    }

    const requestId = `rank-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queryPayload: AssetQuery = {
      protocolVersion: 2,
      query: 'ranking.list',
      requestId,
      sessionId: this.identity?.sessionId ?? '',
      sessionEpoch: this.identity?.sessionEpoch ?? 1,
      payload: {
        scope,
        cursor,
        pageRequest: this.current.pageSize,
      },
    };

    let rawResponse: unknown;
    try {
      if (typeof this.transport === 'function') {
        rawResponse = await this.transport(queryPayload);
      } else {
        const text = await this.transport.send(JSON.stringify(queryPayload));
        rawResponse = JSON.parse(text);
      }
    } catch (err) {
      // Discard late response if generation has drifted
      if (gen !== this.generation) return;

      this.current.status = 'failed';
      this.current.errorCode = 'NETWORK_ERROR';
      this.current.errorMessage = err instanceof Error ? err.message : '网络连接异常';
      this.notify();
      return;
    }

    // Discard late response if generation has drifted
    if (gen !== this.generation) return;

    let response: AssetQueryResponse<'ranking.list'>;
    try {
      response = typeof rawResponse === 'string'
        ? parseAssetQueryResponse('ranking.list', JSON.parse(rawResponse))
        : parseAssetQueryResponse('ranking.list', rawResponse);
    } catch {
      this.current.status = 'failed';
      this.current.errorCode = 'INVALID_RESPONSE';
      this.current.errorMessage = '响应格式解析失败';
      this.notify();
      return;
    }

    if ('error' in response && response.error) {
      this.current.status = 'failed';
      this.current.errorCode = response.error.code;
      this.current.errorMessage = response.error.code;
      this.notify();
      return;
    }

    if (!('data' in response) || !response.data) {
      this.current.status = 'failed';
      this.current.errorCode = 'MISSING_DATA';
      this.current.errorMessage = '返回数据为空';
      this.notify();
      return;
    }

    const resData = response.data;
    if (cursor == null) {
      // First page response
      this.current.entries = resData.entries.map(toItemView);
      this.current.ownRank = resData.ownRank;
      this.current.rankAsOf = Number(resData.rankAsOf);
      this.current.stale = resData.stale;
      this.current.nextCursor = resData.nextCursor;
      this.current.hasMore = resData.nextCursor != null;
      this.current.status = 'ready';
      this.current.errorCode = null;
      this.current.errorMessage = null;
    } else {
      // Subsequent page response with characterId deduplication
      const existingIds = new Set(this.current.entries.map(e => e.characterId));
      const newEntries: RankingItemView[] = [];
      for (const item of resData.entries) {
        const view = toItemView(item);
        if (!existingIds.has(view.characterId)) {
          existingIds.add(view.characterId);
          newEntries.push(view);
        }
      }
      this.current.entries = [...this.current.entries, ...newEntries];
      if (resData.ownRank != null) {
        this.current.ownRank = resData.ownRank;
      }
      this.current.rankAsOf = Number(resData.rankAsOf);
      this.current.stale = resData.stale;
      this.current.nextCursor = resData.nextCursor;
      this.current.hasMore = resData.nextCursor != null;
      this.current.status = 'ready';
      this.current.errorCode = null;
      this.current.errorMessage = null;
    }

    this.notify();
  }

  async open(identity: RankingIdentity, scope: RankingScope = 'all'): Promise<void> {
    const gen = ++this.generation;
    this.identity = { ...identity };
    this.current.status = 'loading';
    this.current.scope = scope;
    this.current.entries = [];
    this.current.ownRank = null;
    this.current.nextCursor = null;
    this.current.hasMore = false;
    this.current.errorCode = null;
    this.current.errorMessage = null;
    this.notify();

    await this.executeQuery(scope, null, gen);
  }

  async switchScope(scope: RankingScope): Promise<void> {
    if (this.current.scope === scope && this.current.status === 'ready') {
      return;
    }
    const gen = ++this.generation;
    this.current.status = 'loading';
    this.current.scope = scope;
    this.current.entries = [];
    this.current.nextCursor = null;
    this.current.hasMore = false;
    this.current.errorCode = null;
    this.current.errorMessage = null;
    this.notify();

    await this.executeQuery(scope, null, gen);
  }

  async loadMore(): Promise<void> {
    if (this.current.status !== 'ready' || !this.current.hasMore || !this.current.nextCursor) {
      return;
    }
    const gen = this.generation;
    this.current.status = 'paging';
    this.notify();

    await this.executeQuery(this.current.scope, this.current.nextCursor, gen);
  }

  async refresh(): Promise<void> {
    const gen = ++this.generation;
    this.current.status = 'loading';
    this.notify();

    await this.executeQuery(this.current.scope, null, gen);
  }

  async retry(): Promise<void> {
    if (this.current.status !== 'failed') return;
    const gen = ++this.generation;
    this.current.status = 'loading';
    this.current.errorCode = null;
    this.current.errorMessage = null;
    this.notify();

    // If we already have entries and nextCursor, retry paging; otherwise fetch first page
    if (this.current.entries.length > 0 && this.current.nextCursor) {
      await this.executeQuery(this.current.scope, this.current.nextCursor, gen);
    } else {
      await this.executeQuery(this.current.scope, null, gen);
    }
  }

  close(): void {
    this.generation++;
    this.current.status = 'closed';
    this.notify();
  }

  dispose(): void {
    this.close();
    this.listeners.clear();
  }
}
