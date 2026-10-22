import test from 'node:test';
import assert from 'node:assert/strict';
import { createContextIdentityPort, isVerifiedIdentity, loginKey } from '../src/identity/identity-v2.ts';

test('trusted-context adapter verifies each invocation without accepting body identity', async () => {
  let context = { APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'subject' };
  const port = createContextIdentityPort({ appId: 'app', environment: 'test', sources: ['minigame'] }, () => context);
  const verified = await port.verify();
  assert.equal(isVerifiedIdentity(verified), true);
  assert.equal(isVerifiedIdentity(JSON.parse(JSON.stringify(verified))), false);
  assert.equal(isVerifiedIdentity({ provider: 'wechat', appId: 'app', subject: 'subject', environment: 'test' }), false);
  for (const patch of [{ APPID: 'other' }, { ENV: 'other' }, { SOURCE: 'http' }, { OPENID: '' }]) {
    context = { APPID: 'app', ENV: 'test', SOURCE: 'minigame', OPENID: 'subject', ...patch };
    await assert.rejects(port.verify(), /AUTH_REQUIRED/);
  }
});

test('typed tuple keys are bounded, stable and unambiguous without disclosing subject', async () => {
  const a = await loginKey('identity', ['wechat', 'app', 'subject', 'test']);
  assert.equal(a, await loginKey('identity', ['wechat', 'app', 'subject', 'test']));
  assert.notEqual(a, await loginKey('account', ['wechat', 'app', 'subject', 'test']));
  assert.notEqual(await loginKey('identity', ['a:b', 'c']), await loginKey('identity', ['a', 'b:c']));
  assert.match(a, /^v2:identity:[A-Za-z0-9_-]{43}$/);
  assert.ok(!a.includes('subject'));
});

test('context identity rejects accessor fields without invoking them', async () => {
  let invoked = false;
  const port = createContextIdentityPort({ appId: 'app', environment: 'test', sources: ['minigame'] }, () => ({ APPID: 'app', ENV: 'test', SOURCE: 'minigame', get OPENID() { invoked = true; return 'subject'; } }));
  await assert.rejects(port.verify(), /AUTH_REQUIRED/);
  assert.equal(invoked, false);
});
