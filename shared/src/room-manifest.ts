/** Canonical immutable contract-resource bytes. This is not a Cocos bundle loader. */
export function canonicalResource(value: unknown): string {
 if(Array.isArray(value)) return '['+value.map(canonicalResource).join(',')+']';
 if(value!==null&&typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalResource((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value);
}
export async function resourceDigest(bytes: Uint8Array): Promise<string> {
 const digest=await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function manifestDigest(value: unknown): Promise<string> { return resourceDigest(new TextEncoder().encode(canonicalResource(value))); }
