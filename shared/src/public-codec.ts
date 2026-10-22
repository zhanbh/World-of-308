import { resource, encodeResource, time, logicTick, decodeRemainder } from './exact-values.ts';

type Scalar = 'resource-v1' | 'time' | 'tick' | 'string' | 'boolean' | 'remainder';
export type PublicSchema = Readonly<Record<string, Scalar | readonly [Scalar]>>;
const kinds = new Set(['resource-v1', 'time', 'tick', 'string', 'boolean', 'remainder']);

/** Flat public projections only. Arrays retain semantic order; callers sort sets by their contract key. */
export function publicCodec(schema: PublicSchema) {
  const entries = Object.entries(schema).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, spec]) => [key, Array.isArray(spec) ? Object.freeze([...spec]) : spec] as const);
  if (!entries.length || entries.length > 64) throw new TypeError('INVALID_SCHEMA');
  for (const [key, spec] of entries) {
    const kind = Array.isArray(spec) ? spec[0] : spec;
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !kinds.has(kind as string) || (Array.isArray(spec) && spec.length !== 1)) throw new TypeError('INVALID_SCHEMA');
  }
  function scalar(kind: string, value: unknown, strict: boolean): unknown {
    switch (kind) {
      case 'resource-v1':
        if (strict && typeof value !== 'string') throw new TypeError('INVALID_RESOURCE_WIRE');
        return encodeResource(resource(value));
      case 'time': return time(value);
      case 'tick': return logicTick(value);
      case 'remainder': return decodeRemainder(value);
      case 'boolean': if (typeof value === 'boolean') return value; break;
      case 'string':
        if (typeof value === 'string' && value.length <= 1024 && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return value;
    }
    throw new TypeError('INVALID_PUBLIC_VALUE');
  }
  function project(value: unknown, strict: boolean): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('INVALID_PUBLIC_OBJECT');
    if (strict && (Object.keys(value).length !== entries.length || Object.keys(value).some(key => !entries.some(([name]) => name === key)))) throw new TypeError('UNKNOWN_PUBLIC_FIELD');
    const output = Object.create(null) as Record<string, unknown>;
    for (const [key, spec] of entries) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw new TypeError('MISSING_PUBLIC_FIELD');
      const input = descriptor.value;
      if (Array.isArray(spec)) {
        if (!Array.isArray(input) || input.length > 256) throw new TypeError('INVALID_PUBLIC_ARRAY');
        output[key] = Array.from(input, item => scalar(spec[0], item, strict));
      } else output[key] = scalar(spec as string, input, strict);
    }
    return output;
  }
  function encode(value: unknown): string {
    const text = JSON.stringify(project(value, false));
    if (text.length > 65536) throw new RangeError('PUBLIC_PAYLOAD_TOO_LARGE');
    return text;
  }
  function decode(text: string): Record<string, unknown> {
    if (typeof text !== 'string' || text.length > 65536) throw new RangeError('PUBLIC_PAYLOAD_TOO_LARGE');
    return project(JSON.parse(text), true);
  }
  return Object.freeze({ encode, decode });
}
