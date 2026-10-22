declare const unit: unique symbol;
export type Time = number & { readonly [unit]: 'Time' };
export type LogicTick = number & { readonly [unit]: 'LogicTick' };
/** Arithmetic contract v1: unsigned 64-bit, 1000 internal units per displayed unit. */
export type ResourceV1 = bigint & { readonly [unit]: 'ResourceV1' };
const U64_MAX = 18446744073709551615n;

function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) throw new TypeError('INVALID_INTEGER');
  return value;
}
export function time(value: unknown): Time { return integer(value) as Time; }
export function logicTick(value: unknown): LogicTick { return integer(value) as LogicTick; }
export function resource(value: unknown): ResourceV1 {
  let parsed: bigint;
  if (typeof value === 'string' && value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value)) parsed = BigInt(value);
  else if (typeof value === 'number') parsed = BigInt(integer(value));
  else if (typeof value === 'bigint') parsed = value;
  else throw new TypeError('INVALID_RESOURCE');
  if (parsed < 0n || parsed > U64_MAX) throw new RangeError('RESOURCE_OVERFLOW');
  return parsed as ResourceV1;
}
export function encodeResource(value: ResourceV1): string { return resource(value).toString(); }

export type Remainder = Readonly<{ numerator: number; denominator: number }>;
export function remainder(numerator: unknown, denominator: unknown): Remainder {
  const n = integer(numerator), d = integer(denominator);
  if (d === 0 || d > 4294967295 || n >= d) throw new RangeError('INVALID_REMAINDER');
  let a = n, b = d;
  while (b) { const next = a % b; a = b; b = next; }
  return Object.freeze({ numerator: n / a, denominator: d / a });
}
export function decodeRemainder(value: unknown): Remainder {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length !== 2) throw new TypeError('INVALID_REMAINDER');
  for (const key of ['numerator', 'denominator']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw new TypeError('INVALID_REMAINDER');
  }
  const input = value as Record<string, unknown>;
  const result = remainder(input.numerator, input.denominator);
  if (result.numerator !== input.numerator || result.denominator !== input.denominator) throw new TypeError('NON_CANONICAL_REMAINDER');
  return result;
}
