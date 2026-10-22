import { InventoryCoordinator } from './InventoryCoordinator';
import type { InventoryIdentity } from './InventoryCoordinator';

/** Explicit browser-only opt-in; production login supplies its own coordinator/transport. */
export async function connectInventoryPreview(): Promise<{ coordinator: InventoryCoordinator; labels: Record<string, string>; assignable: Set<string> }> {
    if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname) || new URLSearchParams(window.location.search).get('inventoryPreview') !== '1') throw new Error('LOCAL_PREVIEW_NOT_ENABLED');
    const post = async (path: string, text: string): Promise<string> => {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(`http://127.0.0.1:8788${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: text, signal: controller.signal });
            if (!response.ok) throw new Error('PREVIEW_UNAVAILABLE');
            return await response.text();
        } finally { clearTimeout(timeout); }
    };
    const bootstrap = JSON.parse(await post('/bootstrap', '{}')) as { previewInstanceId: string; identity: InventoryIdentity; templateLabels: Record<string, string>; assignableTemplates: string[] };
    if (typeof bootstrap.previewInstanceId !== 'string' || !/^[a-f0-9-]{36}$/.test(bootstrap.previewInstanceId) || !bootstrap.identity || typeof bootstrap.identity.sessionId !== 'string' || !Number.isSafeInteger(bootstrap.identity.sessionEpoch) || typeof bootstrap.identity.characterId !== 'string' || !bootstrap.templateLabels || !Array.isArray(bootstrap.assignableTemplates)) throw new Error('INVALID_PREVIEW_BOOTSTRAP');
    const pending = { load: (key: string) => window.localStorage.getItem(`world308:inventory:${bootstrap.previewInstanceId}:${key}`), save: (key: string, value: string | null) => value === null ? window.localStorage.removeItem(`world308:inventory:${bootstrap.previewInstanceId}:${key}`) : window.localStorage.setItem(`world308:inventory:${bootstrap.previewInstanceId}:${key}`, value) };
    const coordinator = new InventoryCoordinator({ send: text => post('/rpc', text) }, pending);
    coordinator.init(bootstrap.identity);
    return { coordinator, labels: bootstrap.templateLabels, assignable: new Set(bootstrap.assignableTemplates) };
}
