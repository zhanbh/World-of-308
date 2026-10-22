import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCodec } from '../src/public-codec.ts';

const codec = () => publicCodec({ z: 'resource-v1', at: 'time', tick: 'tick', label: 'string', ids: ['tick'] });
test('schema-selected public fields have stable digest input and exact round trips', () => {
  const value = { z: '18446744073709551615', at: 0, tick: 2, label: '战士', ids: [2, 1], privateSeed: 'secret' };
  const expected = '{"at":0,"ids":[2,1],"label":"战士","tick":2,"z":"18446744073709551615"}';
  assert.equal(codec().encode(value), expected);
  assert.equal(codec().encode({ ...value, privateSeed: 'different' }), expected);
  assert.equal(codec().encode(codec().decode(expected)), expected);
  assert.throws(() => codec().decode(JSON.stringify(value)));
});
test('invalid public values, excessive payloads and malformed schemas fail closed', () => {
  const good = { z: '0', at: 0, tick: 0, label: '', ids: [] };
  for (const patch of [{ tick: NaN }, { at: -1 }, { z: '01' }, { label: 'a'.repeat(1025) }, { ids: Array(257).fill(0) }, { tick: undefined }]) assert.throws(() => codec().encode({ ...good, ...patch }));
  assert.throws(() => codec().decode(' '.repeat(65537)));
  assert.throws(() => publicCodec({ x: 'unknown' }));
  assert.throws(() => publicCodec({}));
});

test('wire resources require decimal strings and schema mutation cannot change an existing codec', () => {
  const schema = { amount: 'resource-v1', order: ['tick'] };
  const instance = publicCodec(schema);
  schema.amount = 'string';
  schema.order[0] = 'string';
  assert.equal(instance.encode({ amount: 3n, order: [2] }), '{"amount":"3","order":[2]}');
  assert.throws(() => instance.decode('{"amount":3,"order":[2]}'));
  assert.throws(() => instance.encode({ amount: 3n, order: Array(1) }));
});
