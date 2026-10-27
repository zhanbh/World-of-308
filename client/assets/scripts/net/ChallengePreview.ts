import { MovementCoordinator } from './MovementCoordinator';
import { LoadingCoordinator } from './LoadingCoordinator';
import type { EntryPendingStore, EntryTransport } from './ChallengeEntryCoordinator';

export interface ChallengePreviewResult {
    coordinator: MovementCoordinator;
    challengeId: string;
    characterId: string;
}

/** Explicit browser-only opt-in; production login supplies its own coordinator/transport. */
export async function connectChallengePreview(port = 8790): Promise<ChallengePreviewResult> {
    if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        throw new Error('LOCAL_PREVIEW_NOT_ENABLED');
    }
    const post = async (path: string, text: string): Promise<string> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(`http://127.0.0.1:${port}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: text,
                signal: controller.signal
            });
            if (!response.ok) throw new Error('CHALLENGE_PREVIEW_UNAVAILABLE');
            return await response.text();
        } finally {
            clearTimeout(timeout);
        }
    };

    const bootstrapText = await post('/bootstrap', '{}');
    const bootstrap = JSON.parse(bootstrapText) as {
        previewInstanceId: string;
        identity: { sessionId: string; sessionEpoch: number; characterId: string };
        context: { protocolVersion: 2; sessionId: string; sessionEpoch: number; characterId: string; rolePlayEpoch: number; challengeId: string };
        config: any;
        prepareCommand: any;
        basic: any;
    };

    if (!bootstrap || typeof bootstrap.previewInstanceId !== 'string' || !bootstrap.context || !bootstrap.config) {
        throw new Error('INVALID_CHALLENGE_PREVIEW_BOOTSTRAP');
    }

    const pending: EntryPendingStore = {
        load: (key: string) => window.localStorage.getItem(`world308:challenge:${bootstrap.previewInstanceId}:${key}`),
        save: (key: string, value: string | null) => {
            if (value === null) window.localStorage.removeItem(`world308:challenge:${bootstrap.previewInstanceId}:${key}`);
            else window.localStorage.setItem(`world308:challenge:${bootstrap.previewInstanceId}:${key}`, value);
        }
    };

    const transport: EntryTransport = {
        send: async (text: string) => post('/rpc', text)
    };

    const loading = new LoadingCoordinator(transport, pending, {
        load: async (ref: string, releaseRef: string) => {
            const res = await post('/rpc', JSON.stringify({ query: 'resource.resolve', ref, releaseRef }));
            return new TextEncoder().encode(res);
        }
    });

    await loading.prepare(bootstrap.prepareCommand);

    const clock = { now: () => Date.now() };
    const coordinator = new MovementCoordinator(transport, pending, clock);
    await coordinator.load(bootstrap.context, bootstrap.config, loading, bootstrap.basic);

    return {
        coordinator,
        challengeId: bootstrap.context.challengeId,
        characterId: bootstrap.context.characterId
    };
}
