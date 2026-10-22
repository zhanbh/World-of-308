/** Strict data-only schema primitives for the asset public boundary. */
export type Parse<T> = (value: unknown) => T;
export type Value<P> = P extends Parse<infer T> ? T : never;
export function object<S extends Record<string, Parse<unknown>>>(schema: S): Parse<{ [K in keyof S]: Value<S[K]> }> {
  return value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('INVALID_OBJECT');
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !Object.hasOwn(schema, key))) throw new TypeError('UNKNOWN_FIELD');
    const result: Record<string, unknown> = {};
    for (const [key, parse] of Object.entries(schema)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && !('value' in descriptor)) throw new TypeError('INVALID_ACCESSOR');
      const parsed = parse(descriptor?.value);
      if (parsed !== undefined) result[key] = parsed;
    }
    return result as { [K in keyof S]: Value<S[K]> };
  };
}
export const optional = <T>(parse: Parse<T>): Parse<T | undefined> => value => value === undefined ? undefined : parse(value);
export const nullable = <T>(parse: Parse<T>): Parse<T | null> => value => value === null ? null : parse(value);
export function choice<const T extends readonly (string | number | boolean | null)[]>(...allowed: T): Parse<T[number]> {
  return value => { if (!allowed.includes(value as T[number])) throw new TypeError('INVALID_ENUM'); return value as T[number]; };
}
export const boolean: Parse<boolean> = value => { if (typeof value !== 'boolean') throw new TypeError('INVALID_BOOLEAN'); return value; };
export const integer = (min = 0, max = Number.MAX_SAFE_INTEGER): Parse<number> => value => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0)) throw new TypeError('INVALID_INTEGER');
  return value;
};
export const text = (max: number, min = 0): Parse<string> => value => {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u001f\u007f-\u009f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new TypeError('INVALID_TEXT');
  return value;
};
export const id: Parse<string> = value => { const result = text(128, 1)(value); if (/\s/u.test(result)) throw new TypeError('INVALID_ID'); return result; };
export const operationId: Parse<string> = value => { if (typeof value !== 'string' || !/^[\x21-\x7e]{1,64}$/.test(value)) throw new TypeError('INVALID_OPERATION_ID'); return value; };
export const list = <T>(parse: Parse<T>, max: number): Parse<T[]> => value => {
  if (!Array.isArray(value) || value.length > max) throw new TypeError('INVALID_LIST');
  return Array.from(value, entry => parse(entry));
};
export function union<const P extends readonly Parse<unknown>[]>(...parsers: P): Parse<Value<P[number]>> {
  return value => { for (const parse of parsers) { try { return parse(value) as Value<P[number]>; } catch {} } throw new TypeError('INVALID_UNION'); };
}
export function wire(textValue: string, maxBytes: number): unknown {
  if (typeof textValue !== 'string' || new TextEncoder().encode(textValue).length > maxBytes) throw new TypeError('PAYLOAD_TOO_LARGE');
  return JSON.parse(textValue);
}
export function bounded<T>(parse: Parse<T>, maxBytes: number): Parse<T> {
  return value => {
    const result = parse(value);
    if (new TextEncoder().encode(JSON.stringify(result)).length > maxBytes) throw new TypeError('PAYLOAD_TOO_LARGE');
    return result;
  };
}
