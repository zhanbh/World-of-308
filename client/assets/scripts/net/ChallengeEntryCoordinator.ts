import { encodeSceneMessage, decodeSceneReply } from '../../../../shared/src/protocol/scene-wire.ts';
import { parseChallengeRequest, parseChallengeResponse, parseDungeonEntryResponse } from '../../../../shared/src/protocol/scene-v2.ts';
export interface EntryTransport {
    send(text: string): Promise<string>;
}
export interface EntryPendingStore {
    load(key: string): string | null;
    save(key: string, value: string | null): void;
}
export interface EntryIdentity {
    sessionId: string;
    sessionEpoch: number;
    characterId: string;
    rolePlayEpoch: number;
}
type Start = Extract<ReturnType<typeof parseChallengeRequest>, {
    command: 'challenge.start';
}>;
type EntryReply = Extract<ReturnType<typeof parseDungeonEntryResponse>, {
    data: unknown;
}>;
type StartData = Extract<ReturnType<typeof parseChallengeResponse>['outcome'], {
    status: 'committed';
}>['data'];
export interface ChallengeEntryState {
    status: 'closed' | 'loading' | 'choosing' | 'submitting' | 'unknown' | 'failed' | 'started';
    selection: EntryReply['data'] | null;
    started: StartData | null;
    code: string | null;
    pendingOperationId: string | null;
}
/** Selection is read-only until explicit confirmation. Persistence is written before transport. */
export class ChallengeEntryCoordinator {
    private identity: EntryIdentity | null = null;
    private pending: Start | null = null;
    private entry: EntryReply | null = null;
    private generation = 0;
    private sequence = 0;
    private current: ChallengeEntryState = { status: 'closed', selection: null, started: null, code: null, pendingOperationId: null };
    private transport: EntryTransport;
    private persistence: EntryPendingStore;
    constructor(transport: EntryTransport, persistence: EntryPendingStore) { this.transport = transport; this.persistence = persistence; }
    get state(): ChallengeEntryState { return structuredClone(this.current); }
    private key(): string { const i = this.identity!; return JSON.stringify(['challenge-entry', i.sessionId, i.sessionEpoch, i.characterId, i.rolePlayEpoch]); }
    init(identity: EntryIdentity): void {
        ++this.generation;
        this.identity = { ...identity };
        this.pending = null;
        this.entry = null;
        this.current = { status: 'closed', selection: null, started: null, code: null, pendingOperationId: null };
        const saved = this.persistence.load(this.key());
        if (saved !== null) {
            const c = parseChallengeRequest(JSON.parse(saved));
            if (c.command !== 'challenge.start' || c.sessionId !== identity.sessionId || c.sessionEpoch !== identity.sessionEpoch || c.payload.characterId !== identity.characterId || c.payload.rolePlayEpoch !== identity.rolePlayEpoch)
                throw new Error('INVALID_PENDING_CHALLENGE');
            this.pending = c;
            this.current.status = 'unknown';
            this.current.pendingOperationId = c.operationId;
        }
    }
    close(): void { ++this.generation; this.current.status = 'closed'; }
    async open(dungeonId: string): Promise<void> {
        if (!this.identity)
            throw new Error('NO_ACTIVE_CHARACTER');
        if (this.pending)
            throw new Error('PENDING_CHALLENGE');
        const generation = ++this.generation, i = this.identity;
        const q = { protocolVersion: 2 as const, query: 'dungeon.entry' as const, requestId: `entry-${++this.sequence}`, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch, payload: { characterId: i.characterId, rolePlayEpoch: i.rolePlayEpoch, dungeonId } };
        this.current = { status: 'loading', selection: null, started: null, code: null, pendingOperationId: null };
        try {
            const text = await this.transport.send(encodeSceneMessage(q));
            decodeSceneReply(q, text);
            const r = parseDungeonEntryResponse(JSON.parse(text));
            if (generation !== this.generation)
                return;
            if ('error' in r) {
                this.current.status = 'failed';
                this.current.code = r.error.code;
            }
            else {
                this.entry = r;
                this.current.selection = r.data;
                this.current.status = 'choosing';
            }
        }
        catch {
            if (generation === this.generation) {
                this.current.status = 'failed';
                this.current.code = 'SERVICE_UNAVAILABLE';
            }
        }
    }
    async confirm(difficultyId: string, operationId: string): Promise<void> {
        if (!this.identity || !this.entry || this.current.status !== 'choosing' || this.pending)
            throw new Error('ENTRY_NOT_READY');
        const choice = this.entry.data.options.find(o => o.difficultyId === difficultyId);
        if (!choice?.canEnter)
            throw new Error(choice?.reason ?? 'INVALID_DIFFICULTY');
        const i = this.identity;
        const parsed = parseChallengeRequest({ protocolVersion: 2, command: 'challenge.start', operationId, sessionId: i.sessionId, sessionEpoch: i.sessionEpoch, expected: this.entry.versions, payload: { characterId: i.characterId, rolePlayEpoch: i.rolePlayEpoch, dungeonId: this.entry.data.dungeonId, difficultyId, entryContext: this.entry.data.entryContext } });
        if (parsed.command !== 'challenge.start')
            throw new Error('INVALID_PENDING_CHALLENGE');
        this.persistence.save(this.key(), encodeSceneMessage(parsed));
        this.pending = parsed;
        this.current.pendingOperationId = operationId;
        await this.submit();
    }
    async retry(): Promise<void> { if (!this.pending || this.current.status === 'submitting')
        throw new Error('NO_PENDING_CHALLENGE'); await this.submit(); }
    private async submit(): Promise<void> {
        const command = this.pending!, generation = ++this.generation;
        this.current.status = 'submitting';
        this.current.code = null;
        try {
            const text = await this.transport.send(encodeSceneMessage(command));
            decodeSceneReply(command, text);
            const r = parseChallengeResponse(JSON.parse(text));
            if (generation !== this.generation)
                return;
            if (r.outcome.status === 'unknown') {
                this.current.status = 'unknown';
                this.current.code = r.outcome.code;
                return;
            }
            this.persistence.save(this.key(), null);
            this.pending = null;
            this.current.pendingOperationId = null;
            if (r.outcome.status === 'rejected') {
                this.current.status = 'failed';
                this.current.code = r.outcome.code;
            }
            else {
                this.current.status = 'started';
                this.current.started = r.outcome.data;
            }
        }
        catch {
            if (generation === this.generation) {
                this.current.status = 'unknown';
                this.current.code = 'RESULT_UNKNOWN';
            }
        }
    }
}
