import test from 'node:test';
import assert from 'node:assert/strict';
import { resource, encodeResource, time, logicTick, remainder, decodeRemainder } from '../src/exact-values.ts';

test('u64 resources round trip without losing precision', () => {
  assert.equal(encodeResource(resource('18446744073709551615')), '18446744073709551615');
  assert.equal(encodeResource(resource('0')), '0');
  for (const value of ['-1', '18446744073709551616', '01', '1.0', 9007199254740992, NaN, Infinity]) {
    assert.throws(() => resource(value));
  }
});

test('regeneration remainder reduces exactly and wire decoding requires canonical form', () => {
  assert.deepEqual(remainder(2, 6), { numerator: 1, denominator: 3 });
  assert.deepEqual(remainder(0, 123), { numerator: 0, denominator: 1 });
  assert.deepEqual(remainder(4294967294, 4294967295), { numerator: 4294967294, denominator: 4294967295 });
  assert.deepEqual(decodeRemainder({ numerator: 1, denominator: 3 }), remainder(2, 6));
  for (const [n, d] of [[1, 0], [-1, 2], [2, 2], [1, 4294967296], [0.5, 2]]) assert.throws(() => remainder(n, d));
  for (const value of [{ numerator: 2, denominator: 6 }, { numerator: 0, denominator: 2 }, { numerator: 1, denominator: 3, seed: 42 }]) assert.throws(() => decodeRemainder(value));
});

test('wire remainder rejects accessors and symbol fields without invoking code', () => {
  let invoked = false;
  const accessor = { get numerator() { invoked = true; return 1; }, denominator: 3 };
  assert.throws(() => decodeRemainder(accessor));
  assert.equal(invoked, false);
  assert.throws(() => decodeRemainder({ numerator: 1, denominator: 3, [Symbol('hidden')]: true }));
});

test('time and logic ticks accept safe nonnegative integer boundaries', () => {
  for (const parse of [time, logicTick]) {
    assert.equal(parse(0), 0);
    assert.equal(parse(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    for (const value of [-1, -0, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '1']) assert.throws(() => parse(value));
  }
});
