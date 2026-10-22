/** Backend-only identity boundary. The reader is supplied by a server composition root, never a request body. */
declare const verified: unique symbol;
export type VerifiedIdentity = Readonly<{ provider: 'wechat'; appId: string; subject: string; environment: string; invocationKind: string; verificationMethod: 'trusted-context'; readonly [verified]: true }>;
export interface IdentityPort { verify(): Promise<VerifiedIdentity>; }
export type IdentityPolicy = Readonly<{ appId: string; environment: string; sources: readonly string[] }>;
const issued = new WeakSet<object>();
function token(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || /[\s\u0000-\u001f\u007f-\u009f\uD800-\uDFFF]/u.test(value)) throw new Error('AUTH_REQUIRED');
  return value;
}
export function createContextIdentityPort(policy: IdentityPolicy, readContext: () => unknown | Promise<unknown>): IdentityPort {
  const appId = token(policy.appId), environment = token(policy.environment), sources = [...policy.sources].map(token);
  if (!sources.length || sources.length > 8) throw new Error('INVALID_IDENTITY_POLICY');
  return Object.freeze({ async verify() {
    let context: unknown;
    try { context = await readContext(); } catch { throw new Error('AUTH_REQUIRED'); }
    if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('AUTH_REQUIRED');
    const c = context as Record<string, unknown>;
    for (const key of ['OPENID', 'APPID', 'ENV', 'SOURCE']) {
      const descriptor = Object.getOwnPropertyDescriptor(c, key);
      if (!descriptor || !('value' in descriptor)) throw new Error('AUTH_REQUIRED');
    }
    const subject = token(c.OPENID), actualApp = token(c.APPID), actualEnv = token(c.ENV), source = token(c.SOURCE);
    if (actualApp !== appId || actualEnv !== environment || !sources.includes(source)) throw new Error('AUTH_REQUIRED');
    const result = Object.freeze({ provider: 'wechat' as const, appId, subject, environment, invocationKind: source, verificationMethod: 'trusted-context' as const }) as VerifiedIdentity;
    issued.add(result);
    return result;
  } });
}
export function isVerifiedIdentity(value: unknown): value is VerifiedIdentity { return value !== null && typeof value === 'object' && issued.has(value); }
/** Typed tuple hash, retained raw canonical tuples in private records detect any key/record mismatch. */
export async function loginKey(kind: string, parts: readonly (string | number)[]): Promise<string> {
  if (!/^[a-zA-Z][a-zA-Z0-9]{0,19}$/.test(kind) || parts.length > 8 || parts.some(v => typeof v === 'string' ? v.length > 256 : !Number.isSafeInteger(v) || v < 0)) throw new Error('INVALID_KEY');
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([kind, ...parts]))));
  return `v2:${kind}:${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}
export async function identityKey(identity: VerifiedIdentity): Promise<string> {
  if (!isVerifiedIdentity(identity)) throw new Error('AUTH_REQUIRED');
  return loginKey('identity', [identity.provider, identity.appId, identity.subject, identity.environment]);
}
