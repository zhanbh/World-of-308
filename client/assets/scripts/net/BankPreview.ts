import { BankCoordinator } from './BankCoordinator';
import type { InventoryIdentity } from './InventoryCoordinator';

/** Explicit browser-only opt-in; production login supplies its own coordinator/transport. */
export async function connectBankPreview(): Promise<{ coordinator: BankCoordinator; labels: Record<string, string>; contextId: string }> {
    if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname) || new URLSearchParams(window.location.search).get('bankPreview') !== '1') throw new Error('LOCAL_PREVIEW_NOT_ENABLED');
    const post = async (path: string, text: string): Promise<string> => {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(`http://127.0.0.1:8789${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, signal: controller.signal });
            if (!response.ok) throw new Error('PREVIEW_UNAVAILABLE');
            return await response.text();
        } finally { clearTimeout(timeout); }
    };
    const bootstrap = JSON.parse(await post('/bootstrap', '{}')) as { previewInstanceId: string; identity: InventoryIdentity; templateLabels: Record<string, string>; contextId: string };
    if (typeof bootstrap.previewInstanceId !== 'string' || !/^[a-f0-9-]{36}$/.test(bootstrap.previewInstanceId) || !bootstrap.identity || typeof bootstrap.identity.sessionId !== 'string' || !Number.isSafeInteger(bootstrap.identity.sessionEpoch) || typeof bootstrap.identity.characterId !== 'string' || !bootstrap.templateLabels || typeof bootstrap.contextId !== 'string') throw new Error('INVALID_PREVIEW_BOOTSTRAP');
    const pending = { load: (key: string) => window.localStorage.getItem(`world308:bank:${bootstrap.previewInstanceId}:${key}`), save: (key: string, value: string | null) => value === null ? window.localStorage.removeItem(`world308:bank:${bootstrap.previewInstanceId}:${key}`) : window.localStorage.setItem(`world308:bank:${bootstrap.previewInstanceId}:${key}`, value) };
    const coordinator = new BankCoordinator({ send: text => post('/rpc', text) }, pending);
    coordinator.init(bootstrap.identity);
    return { coordinator, labels: bootstrap.templateLabels, contextId: bootstrap.contextId };
}
